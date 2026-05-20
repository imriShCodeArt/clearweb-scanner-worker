import { afterEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires API_KEY in non-test environments", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_KEY", "");

    await expect(import("./env.js")).rejects.toThrow(/API_KEY is required/);
  });

  it("requires a 32-character API_KEY in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_KEY", "too-short");

    await expect(import("./env.js")).rejects.toThrow(/32 characters/);
  });

  it("accepts a long API_KEY in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_KEY", "a".repeat(32));

    const { config } = await import("./env.js");
    expect(config.apiKey).toHaveLength(32);
    expect(config.nodeEnv).toBe("production");
  });

  it("parses TRUST_PROXY as a hop count", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TRUST_PROXY", "2");

    const { config } = await import("./env.js");
    expect(config.trustProxy).toBe(2);
  });
});
