import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

import {
  assertHostnameAllowed,
  assertUrlResolvedSafely,
  isBlockedIpAddress,
} from "./url-security.js";
import { ScanUrlError } from "./url.js";

describe("isBlockedIpAddress", () => {
  it("blocks loopback and private IPv4 ranges", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("127.0.0.2")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.10")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("0.0.0.0")).toBe(true);
    expect(isBlockedIpAddress("198.18.0.1")).toBe(true);
    expect(isBlockedIpAddress("198.19.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
    expect(isBlockedIpAddress("93.184.216.34")).toBe(false);
  });

  it("blocks IPv6 loopback and private ranges", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("fd12:3456:789a:1::1")).toBe(true);
  });

  it("blocks IPv4-mapped private addresses", () => {
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows IPv4-mapped public addresses", () => {
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats malformed addresses as blocked", () => {
    expect(isBlockedIpAddress("not-an-ip")).toBe(true);
  });
});

describe("assertHostnameAllowed", () => {
  it("rejects localhost and internal hostnames", () => {
    expect(() => assertHostnameAllowed("localhost")).toThrow(ScanUrlError);
    expect(() => assertHostnameAllowed("api.localhost")).toThrow(ScanUrlError);
    expect(() => assertHostnameAllowed("app.local")).toThrow(ScanUrlError);
    expect(() => assertHostnameAllowed("db.internal")).toThrow(ScanUrlError);
  });

  it("rejects literal blocked IP hostnames", () => {
    expect(() => assertHostnameAllowed("169.254.169.254")).toThrow(
      ScanUrlError
    );
  });

  it("allows public hostnames", () => {
    expect(() => assertHostnameAllowed("example.com")).not.toThrow();
  });
});

describe("assertUrlResolvedSafely", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    await expect(
      assertUrlResolvedSafely(new URL("https://evil.example.com"))
    ).rejects.toThrow("private or internal");
  });

  it("rejects when any resolved address is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);

    await expect(
      assertUrlResolvedSafely(new URL("https://dual-stack.example.com"))
    ).rejects.toThrow("private or internal");
  });

  it("allows hostnames that resolve to public addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(
      assertUrlResolvedSafely(new URL("https://example.com"))
    ).resolves.toBeUndefined();
  });

  it("skips DNS lookup for literal IP hostnames", async () => {
    await expect(
      assertUrlResolvedSafely(new URL("https://93.184.216.34"))
    ).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects literal private IP URLs without DNS lookup", async () => {
    await expect(
      assertUrlResolvedSafely(new URL("https://10.0.0.1"))
    ).rejects.toThrow(ScanUrlError);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects unresolved hostnames", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(
      assertUrlResolvedSafely(new URL("https://missing.example.com"))
    ).rejects.toThrow(/Could not resolve hostname/);
  });

  it("rejects empty DNS responses", async () => {
    lookupMock.mockResolvedValue([]);

    await expect(
      assertUrlResolvedSafely(new URL("https://empty.example.com"))
    ).rejects.toThrow(/Could not resolve hostname/);
  });
});
