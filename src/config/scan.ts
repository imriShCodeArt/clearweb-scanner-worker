const DEFAULT_SCAN_NAVIGATION_TIMEOUT_MS = 30_000;

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_SCAN_NAVIGATION_TIMEOUT_MS;
  const timeout = Number.parseInt(value, 10);
  if (Number.isNaN(timeout) || timeout < 1000) {
    return DEFAULT_SCAN_NAVIGATION_TIMEOUT_MS;
  }
  return timeout;
}

export const SCAN_NAVIGATION_TIMEOUT_MS = parseTimeout(
  process.env.SCAN_NAVIGATION_TIMEOUT_MS ?? process.env.SCAN_TIMEOUT_MS
);
