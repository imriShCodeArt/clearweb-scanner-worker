/**
 * URL validation and normalization utilities for the scanner.
 */

import { assertHostnameAllowed } from "./url-security.js";

const ALLOWED_PROTOCOLS = ["http:", "https:"];

export class ScanUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanUrlError";
  }
}

/**
 * Fix common typos in the hostname before validation.
 * e.g. Israeli `.co.il` domains pasted as `site.co,il` (comma vs dot on some keyboards).
 */
function fixCommonHostnameTypos(hostname: string): string {
  return hostname.replace(/co,il$/i, 'co.il');
}

/**
 * Parse, validate, and normalize the raw URL input from the user.
 * Returns the parsed URL or throws a ScanUrlError describing the problem.
 */
export function parseAndValidateUrl(raw: string): URL {
  const trimmed = raw.trim();

  // Auto-prepend https:// when no protocol is given so users can paste
  // bare domains like "example.com".
  const withProtocol = trimmed.includes("://")
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new ScanUrlError(`"${raw}" is not a valid URL.`);
  }

  const fixedHost = fixCommonHostnameTypos(parsed.hostname);
  if (fixedHost !== parsed.hostname) {
    parsed.hostname = fixedHost;
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw new ScanUrlError(
      `Only http and https URLs are supported. Got: ${parsed.protocol}`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  assertHostnameAllowed(hostname);

  return parsed;
}

/**
 * Return a stable, lowercased representation of the URL without trailing
 * slashes or fragments, suitable for deduplication and indexing.
 */
export function normalizeUrl(url: URL): string {
  const normalized = new URL(url.toString());
  normalized.hash = '';
  normalized.hostname = normalized.hostname.toLowerCase();
  let result = normalized.toString();
  if (result.endsWith('/') && normalized.pathname === '/') {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Extract the registrable domain (e.g. "example.com") from a URL for indexing.
 */
export function extractDomain(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
