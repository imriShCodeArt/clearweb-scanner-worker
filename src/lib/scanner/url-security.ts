import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

interface DnsLookupAddress {
  address: string;
  family: number;
}

import { ScanUrlError } from "./url.js";

function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets as [number, number, number, number];
}

function isBlockedIpv4(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return true;

  const [a, b] = octets;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;

  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) {
      return isBlockedIpv4(mapped);
    }
  }

  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

export function assertHostnameAllowed(hostname: string): void {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    throw new ScanUrlError(
      "Scanning private or loopback addresses is not allowed."
    );
  }

  if (isIP(normalized) !== 0 && isBlockedIpAddress(normalized)) {
    throw new ScanUrlError(
      "Scanning private or loopback addresses is not allowed."
    );
  }
}

/**
 * Resolve the hostname and reject if any address is private, link-local,
 * or otherwise unsuitable for outbound scanning (SSRF mitigation).
 */
export async function assertUrlResolvedSafely(url: URL): Promise<void> {
  assertHostnameAllowed(url.hostname);

  if (isIP(url.hostname) !== 0) {
    return;
  }

  let records: DnsLookupAddress[];
  try {
    records = (await lookup(url.hostname, {
      all: true,
      verbatim: false,
    })) as DnsLookupAddress[];
  } catch {
    throw new ScanUrlError(`Could not resolve hostname: ${url.hostname}`);
  }

  if (records.length === 0) {
    throw new ScanUrlError(`Could not resolve hostname: ${url.hostname}`);
  }

  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new ScanUrlError(
        "Scanning private or internal addresses is not allowed."
      );
    }
  }
}
