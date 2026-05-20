/**
 * Persist scanner output into the database using Drizzle.
 * All writes are grouped into a logical sequence: page → issues → elements.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { isWcagMappedViolation } from '@/lib/audit/wcagViolation';
import {
  scanIssueElements,
  scanIssues,
  scanPages,
  scans,
} from '@/lib/db/schema';

import type { PageScanResult, ScanRuleSummary } from './axe';
import { computeScore } from './axe';

function totalNodesChecked(rules: ScanRuleSummary[]): number {
  return rules.reduce((sum, r) => sum + r.nodesChecked, 0);
}

export interface PersistScanResultsOptions {
  scanId: string;
  result: PageScanResult;
}

/**
 * Persist one-page scan results to the database.
 * This updates the parent scan row (status, summary counts) and inserts
 * scan_pages, scan_issues, and scan_issue_elements rows.
 */
export async function persistScanResults({
  scanId,
  result,
}: PersistScanResultsOptions): Promise<void> {
  const score = computeScore(result);
  const { screenshotDataUrl, ...resultForRawJson } = result;

  // Tally failing DOM nodes by impact for WCAG-mapped violations only (matches score).
  let criticalIssues = 0;
  let seriousIssues = 0;
  let moderateIssues = 0;
  let minorIssues = 0;
  for (const v of result.violations) {
    if (!isWcagMappedViolation(v)) continue;
    const n = v.nodes.length;
    if (v.impact === 'critical') criticalIssues += n;
    else if (v.impact === 'serious') seriousIssues += n;
    else if (v.impact === 'moderate') moderateIssues += n;
    else minorIssues += n;
  }

  // Insert the scanned page.
  const [page] = await db
    .insert(scanPages)
    .values({
      scanId,
      url: result.url,
      normalizedUrl: result.normalizedUrl,
      title: result.title || null,
      statusCode: result.statusCode,
      score,
      pageScreenshotDataUrl: screenshotDataUrl ?? null,
    })
    .returning({ id: scanPages.id });

  // Insert issues and their failing elements.
  for (const violation of result.violations) {
    const [issue] = await db
      .insert(scanIssues)
      .values({
        scanId,
        pageId: page.id,
        ruleId: violation.ruleId,
        title: violation.title,
        description: violation.description,
        impact: violation.impact,
        wcagCriteria: violation.wcagCriteria,
        wcagLevel: violation.wcagLevel,
        helpUrl: violation.helpUrl,
        failingElementsCount: violation.nodes.length,
        rawIssue: violation as unknown as Record<string, unknown>,
      })
      .returning({ id: scanIssues.id });

    if (violation.nodes.length > 0) {
      await db.insert(scanIssueElements).values(
        violation.nodes.map((node) => ({
          issueId: issue.id,
          target: node.target,
          htmlSnippet: node.htmlSnippet,
          failureSummary: node.failureSummary,
          xpath: node.xpath,
        })),
      );
    }
  }

  // Update the parent scan to completed with summary counts.
  await db
    .update(scans)
    .set({
      status: 'completed',
      score,
      pagesScanned: 1,
      criticalIssues,
      seriousIssues,
      moderateIssues,
      minorIssues,
      passedAudits: totalNodesChecked(result.passedRules),
      manualAudits: totalNodesChecked(result.manualRules),
      notApplicable: totalNodesChecked(result.notApplicableRules),
      overlayDetected: result.overlayDetected,
      rawResult: resultForRawJson as unknown as Record<string, unknown>,
      scanProgress: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(scans.id, scanId));
}

/**
 * Mark a scan as failed with an error message.
 */
export async function markScanFailed(
  scanId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(scans)
    .set({
      status: 'failed',
      errorMessage,
      scanProgress: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(scans.id, scanId));
}
