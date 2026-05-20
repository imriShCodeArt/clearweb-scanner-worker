import { describe, expect, it } from "vitest";

import {
  ScanUrlError,
  extractDomain,
  normalizeUrl,
  parseAndValidateUrl,
} from "./url.js";

describe("parseAndValidateUrl", () => {
  it("accepts https URLs", () => {
    const parsed = parseAndValidateUrl("https://example.com/path");
    expect(parsed.hostname).toBe("example.com");
    expect(parsed.protocol).toBe("https:");
  });

  it("prepends https when no protocol is given", () => {
    const parsed = parseAndValidateUrl("example.com");
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe("example.com");
  });

  it("accepts http URLs", () => {
    const parsed = parseAndValidateUrl("http://example.com");
    expect(parsed.protocol).toBe("http:");
  });

  it("fixes common co,il hostname typos", () => {
    const parsed = parseAndValidateUrl("https://example.co,il");
    expect(parsed.hostname).toBe("example.co.il");
  });

  it("rejects invalid URLs", () => {
    expect(() => parseAndValidateUrl("@@@")).toThrow(ScanUrlError);
    expect(() => parseAndValidateUrl("@@@")).toThrow(/not a valid URL/);
  });

  it("rejects unsupported protocols", () => {
    expect(() => parseAndValidateUrl("ftp://example.com")).toThrow(
      ScanUrlError
    );
    expect(() => parseAndValidateUrl("ftp://example.com")).toThrow(
      /Only http and https/
    );
  });

  it("rejects localhost and private hostnames", () => {
    expect(() => parseAndValidateUrl("http://localhost")).toThrow(ScanUrlError);
    expect(() => parseAndValidateUrl("https://app.local")).toThrow(
      ScanUrlError
    );
    expect(() => parseAndValidateUrl("https://db.internal")).toThrow(
      ScanUrlError
    );
  });

  it("rejects literal private IP addresses", () => {
    expect(() => parseAndValidateUrl("http://127.0.0.1")).toThrow(
      ScanUrlError
    );
    expect(() => parseAndValidateUrl("http://169.254.169.254")).toThrow(
      ScanUrlError
    );
  });

  it("trims surrounding whitespace", () => {
    const parsed = parseAndValidateUrl("  https://example.com  ");
    expect(parsed.hostname).toBe("example.com");
  });
});

describe("normalizeUrl", () => {
  it("lowercases hostname and removes hash fragments", () => {
    const normalized = normalizeUrl(
      new URL("https://EXAMPLE.COM/Page#section")
    );
    expect(normalized).toBe("https://example.com/Page");
  });

  it("removes trailing slash for root paths", () => {
    const normalized = normalizeUrl(new URL("https://example.com/"));
    expect(normalized).toBe("https://example.com");
  });

  it("keeps trailing slash for non-root paths", () => {
    const normalized = normalizeUrl(new URL("https://example.com/about/"));
    expect(normalized).toBe("https://example.com/about/");
  });
});

describe("extractDomain", () => {
  it("strips www prefix", () => {
    expect(extractDomain(new URL("https://www.example.com"))).toBe(
      "example.com"
    );
  });

  it("returns hostname when www is absent", () => {
    expect(extractDomain(new URL("https://example.com"))).toBe("example.com");
  });
});
