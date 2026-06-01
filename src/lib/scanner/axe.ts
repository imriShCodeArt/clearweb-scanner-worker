/**
 * Playwright + axe-core accessibility runner.
 * This module must only be imported in server-side code (API routes or
 * Server Actions) because it uses Node.js APIs.
 */
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeResults } from "axe-core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Browser, type Page, chromium } from "playwright";

import { config } from "../../config/env.js";
import { isWcagMappedViolation } from "../audit/wcagViolation.js";
import { logger } from "../logger.js";
import {
  assertSuccessfulPageLoad,
  resolveScannerUserAgent,
} from "./page-load.js";
import { updateScanProgress } from "./scan-progress.js";

/**
 * Tag Playwright/axe errors with the scanner phase so logs and `error_message`
 * show where the run failed (e.g. navigation timeout vs axe analyze).
 */
async function inScanPhase<T>(phase: string, fn: () => Promise<T>): Promise<T> {
  const prefix = `[scan:${phase}] `;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error) {
      if (!err.message.includes(prefix.trim())) {
        err.message = `${prefix}${err.message}`;
      }
      throw err;
    }
    throw new Error(`${prefix}${String(err)}`, { cause: err });
  }
}

async function reportScanProgress(
  scanId: string | undefined,
  phase: string,
  percent: number,
): Promise<void> {
  if (!scanId) return;
  try {
    await updateScanProgress(scanId, { phase, percent });
  } catch (err) {
    console.error('[a11y-scanner] scan progress update failed:', err);
  }
}

// Read the pre-built axe-core browser bundle via package resolution so it works
// with npm, Yarn PnP, and Docker — not a hard-coded node_modules path.
const require = createRequire(import.meta.url);
const axeCorePackageJson = require.resolve("axe-core/package.json");
const axeSource = readFileSync(
  join(dirname(axeCorePackageJson), "axe.min.js"),
  "utf-8"
);

export interface ScanViolationNode {
  target: string[];
  htmlSnippet: string | null;
  failureSummary: string | null;
  xpath: string | null;
}

export interface ScanViolation {
  ruleId: string;
  title: string;
  description: string | null;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagCriteria: string[];
  wcagLevel: 'a' | 'aa' | 'aaa' | null;
  helpUrl: string | null;
  nodes: ScanViolationNode[];
}

/** Summary row for axe passes / incomplete / inapplicable rules (persisted on scans.raw_result). */
export interface ScanRuleSummary {
  ruleId: string;
  title: string;
  description: string | null;
  /** axe assigns impact even on passes — handy for grouping */
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  wcagCriteria: string[];
  wcagLevel: 'a' | 'aa' | 'aaa' | null;
  helpUrl: string | null;
  /** Number of DOM nodes this rule evaluated on */
  nodesChecked: number;
  /** Flattened CSS selectors of matched nodes (deduped; may be empty). */
  selectors: string[];
}

type AxeRuleNodeLike = {
  target?: unknown;
};

export interface PageScanResult {
  url: string;
  normalizedUrl: string;
  title: string;
  statusCode: number;
  /** JPEG data URL of the viewport after the page settled (null if capture failed). */
  screenshotDataUrl: string | null;
  violations: ScanViolation[];
  passedRules: ScanRuleSummary[];
  manualRules: ScanRuleSummary[];
  notApplicableRules: ScanRuleSummary[];
  passesCount: number;
  incompleteCount: number;
  inapplicableCount: number;
  overlayDetected: boolean;
}

/** Best-effort viewport JPEG; budget is tight vs axe so failures are caught and ignored. */
const SCREENSHOT_TIMEOUT_MS = 25_000;

/** Options that reduce hangs on animated/heavy pages (fonts can be "loaded" yet raster never settles). */
const VIEWPORT_SCREENSHOT_OPTS = {
  fullPage: false,
  timeout: SCREENSHOT_TIMEOUT_MS,
  animations: 'disabled' as const,
  caret: 'hide' as const,
};

/**
 * axe-core rule tags to evaluate.
 *
 * Mirrors what the axe DevTools browser extension runs by default:
 * full WCAG 2.0 / 2.1 / 2.2 A & AA coverage plus best-practice rules.
 * This aligns with the Israeli accessibility standard IS 5568, which
 * mandates WCAG 2.1 AA compliance.
 */
const AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  // Best-practice rules are included by axe DevTools by default and catch
  // real issues missed by WCAG tags alone: heading order, landmark structure,
  // positive tabindex, missing H1, unlabelled dialogs, skip-link targets, etc.
  'best-practice',
];

/**
 * Experimental rules that are enabled in the axe browser extension but
 * disabled by default in axe-core.  Each maps to a real WCAG 2.1 criterion
 * required by IS 5568.
 *
 * label-content-name-mismatch — WCAG 2.5.3 (Label in Name)
 * p-as-heading                 — WCAG 1.3.1 (bold/italic text used as heading)
 * css-orientation-lock         — WCAG 1.3.4 (orientation lock via CSS)
 * td-has-header                — WCAG 1.3.1 (large tables missing headers)
 */
const EXPERIMENTAL_RULE_IDS = [
  'p-as-heading',
  'css-orientation-lock',
  'td-has-header',
] as const;

/**
 * Cookie / GDPR consent banner selectors to try dismissing before scanning.
 * Ordered from most-specific to most-generic.  Failures are silently ignored.
 */
const CONSENT_DISMISS_SELECTORS = [
  // Well-known CMP implementations
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#cookieyes-accept',
  // Generic ID/class patterns
  '[id*="accept-cookies" i]',
  '[id*="cookie-accept" i]',
  '[class*="js-cookie-accept"]',
  // Visible text — English
  'button:text-matches("^(accept all|accept cookies|accept|agree|allow all|got it|ok|okay|i agree)$", "i")',
  // Visible text — Hebrew (IS 5568 sites are often Hebrew)
  'button:text-matches("^(אישור|אני מסכים|קבל הכל|קבל|הסכם|המשך|סגור)$", "i")',
];

async function launchChromiumForScan() {
  return chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  });
}

/**
 * Known accessibility overlay script patterns (hostname fragments).
 * Detecting a network request to any of these marks the scan as having
 * an overlay active.
 */
const OVERLAY_HOSTNAME_PATTERNS = [
  'userway.org',
  'accessibe.com',
  'audioeye.com',
  'equalweb.com',
  'maxaccess.io',
  'truconversion.com',
  'reciteme.com',
  'browsealoud.com',
  'essentialaccessibility.com',
  'silktide.com',
];

/**
 * Attempt to dismiss cookie-consent and GDPR banners before scanning.
 * Overlays that block page content inflate violation counts and hide
 * real issues underneath.  Failures are silently swallowed.
 */
async function dismissConsentBanners(page: Page): Promise<void> {
  for (const selector of CONSENT_DISMISS_SELECTORS) {
    try {
      const el = page.locator(selector).first();
      const visible = await el.isVisible({ timeout: 600 }).catch(() => false);
      if (visible) {
        await el.click({ timeout: 1_200 });
        // Let the banner animate out before continuing.
        await page.waitForTimeout(700);
        return;
      }
    } catch {
      // Intentionally swallowed — a banner that can't be dismissed must not
      // block the rest of the scan.
    }
  }
}

/**
 * Scroll from the top to the bottom of the page in steps, then return to the
 * top.  This triggers IntersectionObserver callbacks and loads lazy images /
 * components so that axe sees the fully-rendered DOM.
 */
async function revealLazyContent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 400);
    const maxY = document.documentElement.scrollHeight;
    for (let y = step; y < maxY; y += step) {
      window.scrollTo(0, y);
      // Short pause for IntersectionObserver / image decode to fire.
      await new Promise<void>((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  // Wait for any network requests triggered by lazy loading to settle.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/**
 * Convert an axe WCAG tag like "wcag111" or "wcag143" into dotted notation
 * like "1.1.1" or "1.4.3".
 */
function tagToWcagCriterion(tag: string): string | null {
  const match = tag.match(/^wcag(\d{2,4})$/);
  if (!match) return null;
  const digits = match[1];
  if (!digits) return null;
  // Split into groups: first digit = principle, second = guideline, rest = criterion
  if (digits.length === 3) {
    return `${digits[0]}.${digits[1]}.${digits[2]}`;
  }
  if (digits.length === 4) {
    return `${digits[0]}.${digits[1]}.${digits[2]}${digits[3]}`;
  }
  return null;
}

/**
 * Derive the highest WCAG conformance level from axe rule tags.
 */
function deriveWcagLevel(tags: string[]): 'a' | 'aa' | 'aaa' | null {
  if (tags.includes('wcag2aaa') || tags.includes('wcag21aaa')) return 'aaa';
  if (
    tags.includes('wcag2aa') ||
    tags.includes('wcag21aa') ||
    tags.includes('wcag22aa')
  )
    return 'aa';
  if (
    tags.includes('wcag2a') ||
    tags.includes('wcag21a') ||
    tags.includes('wcag22a')
  )
    return 'a';
  return null;
}

/**
 * Normalise the raw axe impact string to the DB enum shape.
 * Axe guarantees one of: critical | serious | moderate | minor.
 * Fall back to 'minor' for any unexpected value.
 */
function normalizeImpact(
  raw: string | null | undefined,
): 'critical' | 'serious' | 'moderate' | 'minor' {
  if (
    raw === 'critical' ||
    raw === 'serious' ||
    raw === 'moderate' ||
    raw === 'minor'
  ) {
    return raw;
  }
  return 'minor';
}

function mapAxeRuleSummary(p: {
  id: string;
  impact?: string | null;
  tags?: string[];
  description?: string;
  help: string;
  helpUrl?: string;
  nodes?: unknown[];
}): ScanRuleSummary {
  const impactRaw = p.impact;
  const impact =
    impactRaw === 'critical' ||
    impactRaw === 'serious' ||
    impactRaw === 'moderate' ||
    impactRaw === 'minor'
      ? impactRaw
      : null;

  const selectors = Array.isArray(p.nodes)
    ? Array.from(
        new Set(
          p.nodes
            .flatMap((node) => {
              const target = (node as AxeRuleNodeLike)?.target;
              return Array.isArray(target)
                ? target.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : [];
            })
            .map((selector) => selector.trim())
            .filter((selector) => selector.length > 0),
        ),
      ).slice(0, 50)
    : [];

  return {
    ruleId: p.id,
    title: p.help,
    description: p.description ?? null,
    impact,
    wcagCriteria: (p.tags ?? [])
      .map(tagToWcagCriterion)
      .filter((c): c is string => c !== null),
    wcagLevel: deriveWcagLevel(p.tags ?? []),
    helpUrl: p.helpUrl ?? null,
    nodesChecked: Array.isArray(p.nodes) ? p.nodes.length : 0,
    selectors,
  };
}

export interface RunAxeScanOptions {
  scanId?: string;
  browser?: Browser;
  includeScreenshot?: boolean;
}

/**
 * Run an axe-core accessibility scan against the given URL using Playwright.
 *
 * Improvements over a basic scan to match axe DevTools coverage:
 * - Desktop viewport (1280×800) for realistic layout rendering.
 * - Waits for DOMContentLoaded → networkidle, then scrolls through the page
 *   to trigger lazy-loaded content, then waits for the network to re-settle.
 * - Attempts to dismiss cookie / GDPR consent banners before scanning.
 * - Runs WCAG 2.0/2.1/2.2 A & AA rules plus best-practice rules (matching
 *   axe DevTools defaults) and key experimental rules required by IS 5568.
 */
export async function runAxeScan(
  targetUrl: string,
  options: RunAxeScanOptions = {},
): Promise<PageScanResult> {
  const ownsBrowser = options.browser === undefined;
  const browser =
    options.browser ??
    (await inScanPhase("launch_browser", () => launchChromiumForScan()));

  if (ownsBrowser) {
    await reportScanProgress(options.scanId, "launch_browser", 12);
  }

  try {
    return await runAxeScanWithBrowser(browser, targetUrl, options);
  } finally {
    if (ownsBrowser) {
      await browser.close();
    }
  }
}

async function runAxeScanWithBrowser(
  browser: Browser,
  targetUrl: string,
  options: RunAxeScanOptions = {},
): Promise<PageScanResult> {
  const scanId = options.scanId;
  const includeScreenshot = options.includeScreenshot ?? false;
  const context = await inScanPhase("browser_context", () =>
    browser.newContext({
      userAgent: resolveScannerUserAgent(config.playwright.userAgent),
      viewport: { width: 1280, height: 800 },
    }),
  );

  try {
    await reportScanProgress(scanId, "browser_context", 18);

    const overlayDetectedRef = { value: false };

    context.on('request', (request) => {
      const url = request.url().toLowerCase();
      if (OVERLAY_HOSTNAME_PATTERNS.some((p) => url.includes(p))) {
        overlayDetectedRef.value = true;
      }
    });

    const page = await inScanPhase('new_page', () => context.newPage());
    await reportScanProgress(scanId, 'new_page', 24);
    page.setDefaultNavigationTimeout(config.scanNavigationTimeoutMs);

    // Track the HTTP status of the main-frame document. Always update so that
    // redirect chains (301/302/307/308 → 200) resolve to the final status code.
    let statusCode = 0;
    page.on('response', (response) => {
      if (
        response.request().resourceType() === 'document' &&
        response.frame() === page.mainFrame()
      ) {
        statusCode = response.status();
      }
    });

    // Navigate and wait for initial HTML parse to complete.
    await inScanPhase('goto', () =>
      page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.scanNavigationTimeoutMs,
      }),
    );
    await reportScanProgress(scanId, 'goto', 38);

    assertSuccessfulPageLoad(statusCode, targetUrl);

    // Let scripts and async resources finish loading.
    await inScanPhase('page_prepare', async () => {
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await dismissConsentBanners(page);
      await revealLazyContent(page);
      await page.waitForTimeout(400);
    });
    await reportScanProgress(scanId, 'page_prepare', 52);

    // Capture final URL after redirects and dynamic rewrites.
    const finalUrl = page.url();
    const title = await page.title();

    // Capture a thumbnail JPEG without changing the page viewport (which would
    // affect subsequent axe analysis).  Two-pass quality reduction keeps the
    // base64 data URL well within Neon's HTTP transport limits:
    //   • Pass 1: quality 25  → ~15–60 KB for most sites
    //   • Pass 2: quality 10  → ~8–25 KB for very image-heavy pages
    let screenshotDataUrl: string | null = null;
    if (includeScreenshot) {
      try {
        let buf = await page.screenshot({
          type: "jpeg",
          quality: 25,
          ...VIEWPORT_SCREENSHOT_OPTS,
        });
        if (buf.toString("base64").length > 50_000) {
          buf = await page.screenshot({
            type: "jpeg",
            quality: 10,
            ...VIEWPORT_SCREENSHOT_OPTS,
          });
        }
        screenshotDataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
      } catch (err) {
        logger.error({ err, scanId, url: targetUrl }, "screenshot failed");
        screenshotDataUrl = null;
      }

      await reportScanProgress(scanId, "screenshot", 62);
    }

    let axeHeartbeat: ReturnType<typeof setInterval> | undefined;
    if (scanId) {
      await reportScanProgress(scanId, 'axe_analyze', 68);
      axeHeartbeat = setInterval(() => {
        void reportScanProgress(scanId, 'axe_analyze', 75);
      }, 20_000);
    }

    let axeResults: AxeResults;
    try {
      axeResults = await inScanPhase('axe_analyze', () =>
        new AxeBuilder({ page, axeSource })
          .withTags(AXE_TAGS)
          // Enable experimental rules that are active in the axe browser extension
          // and map to WCAG 2.1 criteria required by IS 5568.
          .options({
            rules: Object.fromEntries(
              EXPERIMENTAL_RULE_IDS.map((id) => [id, { enabled: true }]),
            ),
          })
          .analyze(),
      );
    } finally {
      if (axeHeartbeat) clearInterval(axeHeartbeat);
    }

    const violations: ScanViolation[] = axeResults.violations.map((v) => ({
      ruleId: v.id,
      title: v.help,
      description: v.description ?? null,
      impact: normalizeImpact(v.impact),
      wcagCriteria: (v.tags ?? [])
        .map(tagToWcagCriterion)
        .filter((c): c is string => c !== null),
      wcagLevel: deriveWcagLevel(v.tags ?? []),
      helpUrl: v.helpUrl ?? null,
      nodes: v.nodes.map((n) => ({
        target: n.target.map(String),
        htmlSnippet: n.html ?? null,
        failureSummary: n.failureSummary ?? null,
        xpath: Array.isArray(n.xpath) ? (n.xpath[0] ?? null) : null,
      })),
    }));

    return {
      url: targetUrl,
      normalizedUrl: finalUrl,
      title,
      statusCode: statusCode || 200,
      screenshotDataUrl,
      violations,
      passedRules: axeResults.passes.map(mapAxeRuleSummary),
      manualRules: axeResults.incomplete.map(mapAxeRuleSummary),
      notApplicableRules: axeResults.inapplicable.map(mapAxeRuleSummary),
      passesCount: axeResults.passes.length,
      incompleteCount: axeResults.incomplete.length,
      inapplicableCount: axeResults.inapplicable.length,
      overlayDetected: overlayDetectedRef.value,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Compute a 0–100 accessibility score, intentionally strict.
 *
 * Design rationale:
 * - Starts at 100 and deducts points — passed rules do NOT dilute penalties.
 * - Deductions are node-weighted: a rule failing 10 elements is far worse than
 *   one failing a single element.
 * - When at least one rule produced passing checks (`nodesChecked` on passes),
 *   total deduction is capped so the score does not bottom out at 0. A flat 0
 *   is reserved for scans with no passing checks (pathological / broken runs).
 * - Hard caps enforce that critical/serious violations always produce a low
 *   score, regardless of how many other rules passed.
 *
 * Tuning targets (approximate):
 *   0 violations              → 100
 *   1 critical (1 node)       → ≤ 60
 *   1 serious  (3 nodes)      → ≤ 79
 *   Many moderate/minor only  → 60–85 range
 *
 * Only violations mapped to WCAG (criteria and/or level) affect the score.
 * Best-practice-only rules with no WCAG tags do not reduce the score.
 */
export function computeScore(result: PageScanResult): number {
  const { violations, passedRules } = result;

  if (violations.length === 0) return 100;

  const scoringViolations = violations.filter(isWcagMappedViolation);
  if (scoringViolations.length === 0) return 100;

  const passNodeChecks = passedRules.reduce(
    (sum, r) => sum + r.nodesChecked,
    0,
  );
  const hasPassingChecks = passNodeChecks > 0;

  // Points deducted per affected DOM node, by impact level.
  const nodeWeight = {
    critical: 8,
    serious: 4,
    moderate: 2,
    minor: 0.5,
  } as const;

  // Maximum a single rule can deduct (prevents one runaway rule from zeroing
  // out the score while masking every other problem).
  const ruleCap = {
    critical: 30,
    serious: 20,
    moderate: 12,
    minor: 4,
  } as const;

  const totalDeduction = scoringViolations.reduce((sum, v) => {
    const raw = nodeWeight[v.impact] * Math.max(1, v.nodes.length);
    return sum + Math.min(raw, ruleCap[v.impact]);
  }, 0);

  /** When some checks pass, keep a small non-zero floor (0% means “no passes”). */
  const maxDeduction = hasPassingChecks ? 94 : 100;
  const clampedDeduction = Math.min(totalDeduction, maxDeduction);

  let score = Math.round(100 - clampedDeduction);

  // Hard caps: even one critical or serious violation must produce a score
  // that signals the site needs professional remediation.
  if (scoringViolations.some((v) => v.impact === 'critical')) {
    score = Math.min(score, 60);
  } else if (scoringViolations.some((v) => v.impact === 'serious')) {
    score = Math.min(score, 79);
  }

  return Math.max(0, Math.min(100, score));
}
