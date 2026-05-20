import { afterAll, describe, expect, it } from "vitest";

import { config } from "../config/env.js";
import { PlaywrightScanner } from "./scanner.js";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!runIntegration)("Playwright integration", () => {
  const scanner = new PlaywrightScanner({
    ...config,
    scanTimeoutMs: 60_000,
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("scans https://example.com end to end", async () => {
    const result = await scanner.scan({ url: "https://example.com" });

    expect(result.url).toContain("example.com");
    expect(result.statusCode).toBe(200);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.violations)).toBe(true);
  }, 90_000);
});
