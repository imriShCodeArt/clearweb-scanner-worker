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

/**
 * Return the configured user-agent override, or undefined to let Playwright
 * use the real Chromium UA. A hardcoded UA risks a version mismatch with the
 * sec-ch-ua client-hint headers that Chromium sends automatically, which WAFs
 * detect as a bot signal and respond with 403.
 */
export function resolveScannerUserAgent(
  configured: string | undefined,
): string | undefined {
  const trimmed = configured?.trim();
  return trimmed || undefined;
}
