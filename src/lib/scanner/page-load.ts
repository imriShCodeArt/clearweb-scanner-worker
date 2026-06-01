/** True when the main document response is safe to treat as a real page load. */
export function isSuccessfulPageLoad(statusCode: number): boolean {
  return statusCode >= 200 && statusCode <= 299;
}

export class PageLoadHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, url: string) {
    super(
      `[scan:page_load] The server returned HTTP ${statusCode} for ${url}. The page could not be loaded for accessibility testing.`,
    );
    this.name = "PageLoadHttpError";
    this.statusCode = statusCode;
  }
}

export function assertSuccessfulPageLoad(
  statusCode: number,
  url: string,
): void {
  if (!statusCode) {
    throw new PageLoadHttpError(0, url);
  }
  if (!isSuccessfulPageLoad(statusCode)) {
    throw new PageLoadHttpError(statusCode, url);
  }
}

/** Default Playwright context UA — realistic Chrome to reduce WAF false positives. */
export const DEFAULT_SCANNER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function resolveScannerUserAgent(
  configured: string | undefined,
): string {
  const trimmed = configured?.trim();
  return trimmed || DEFAULT_SCANNER_USER_AGENT;
}
