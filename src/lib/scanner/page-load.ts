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
 * Build a non-headless Chrome User-Agent string from the real Chromium version
 * reported by Playwright (e.g. "148.0.7778.96"). Headless Chromium advertises
 * "HeadlessChrome" in its UA, which WAFs like Cloudflare immediately block.
 * Replacing it with "Chrome" while keeping the exact version avoids that signal
 * without introducing a version mismatch with sec-ch-ua or TLS fingerprints.
 *
 * If a SCANNER_USER_AGENT override is configured it takes precedence.
 */
export function resolveScannerUserAgent(
  browserVersion: string,
  configured: string | undefined,
): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
}
