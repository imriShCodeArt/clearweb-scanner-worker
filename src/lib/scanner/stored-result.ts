import type { ScanRuleSummary } from "./axe.js";

function parseImpact(v: unknown): ScanRuleSummary['impact'] {
  if (
    v === 'critical' ||
    v === 'serious' ||
    v === 'moderate' ||
    v === 'minor'
  ) {
    return v;
  }
  return null;
}

function parseRuleArray(v: unknown): ScanRuleSummary[] {
  if (!Array.isArray(v)) return [];
  const out: ScanRuleSummary[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.ruleId !== 'string' || typeof r.title !== 'string') continue;
    const wcagCriteria = Array.isArray(r.wcagCriteria)
      ? r.wcagCriteria.filter((x): x is string => typeof x === 'string')
      : [];
    const levelRaw = r.wcagLevel;
    const wcagLevel =
      levelRaw === 'a' || levelRaw === 'aa' || levelRaw === 'aaa'
        ? levelRaw
        : null;
    const nodesChecked =
      typeof r.nodesChecked === 'number' && Number.isFinite(r.nodesChecked)
        ? Math.max(0, Math.floor(r.nodesChecked))
        : 0;
    const selectors = Array.isArray(r.selectors)
      ? r.selectors.filter((x): x is string => typeof x === 'string')
      : [];

    out.push({
      ruleId: r.ruleId,
      title: r.title,
      description: typeof r.description === 'string' ? r.description : null,
      impact: parseImpact(r.impact),
      wcagCriteria,
      wcagLevel,
      helpUrl: typeof r.helpUrl === 'string' ? r.helpUrl : null,
      nodesChecked,
      selectors,
    });
  }
  return out;
}

/**
 * Read persisted axe rule lists from `scans.raw_result` (JSON).
 * Older scans may omit these arrays — callers should fall back to counts only.
 */
export function parseStoredAuditLists(raw: unknown): {
  passedRules: ScanRuleSummary[];
  manualRules: ScanRuleSummary[];
  notApplicableRules: ScanRuleSummary[];
} {
  const empty = {
    passedRules: [] as ScanRuleSummary[],
    manualRules: [] as ScanRuleSummary[],
    notApplicableRules: [] as ScanRuleSummary[],
  };
  if (!raw || typeof raw !== 'object') return empty;
  const o = raw as Record<string, unknown>;
  return {
    passedRules: parseRuleArray(o.passedRules),
    manualRules: parseRuleArray(o.manualRules),
    notApplicableRules: parseRuleArray(o.notApplicableRules),
  };
}
