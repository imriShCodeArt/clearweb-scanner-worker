import type { ScanViolation } from "../scanner/axe.js";

export function isWcagMappedViolation(
  violation: Pick<ScanViolation, "wcagCriteria" | "wcagLevel">
): boolean {
  return violation.wcagCriteria.length > 0 || violation.wcagLevel !== null;
}
