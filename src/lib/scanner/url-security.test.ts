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
    expect(isBlockedIpAddress("10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.10")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("0.0.0.0")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
  });

  it("blocks IPv6 loopback and private ranges", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
  });
});

describe("assertHostnameAllowed", () => {
  it("rejects localhost and internal hostnames", () => {
    expect(() => assertHostnameAllowed("localhost")).toThrow(ScanUrlError);
    expect(() => assertHostnameAllowed("app.local")).toThrow(ScanUrlError);
    expect(() => assertHostnameAllowed("db.internal")).toThrow(ScanUrlError);
  });
});

describe("assertUrlResolvedSafely", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    await expect(
      assertUrlResolvedSafely(new URL("https://evil.example.com")),
    ).rejects.toThrow("private or internal");
  });

  it("allows hostnames that resolve to public addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(
      assertUrlResolvedSafely(new URL("https://example.com")),
    ).resolves.toBeUndefined();
  });
});
