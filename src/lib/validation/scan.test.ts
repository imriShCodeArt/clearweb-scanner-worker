import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  formatZodError,
  scanRequestSchema,
} from "./scan.js";

describe("scanRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: { timeout: 5000, includeScreenshot: true },
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing url", () => {
    const result = scanRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain("url");
    }
  });

  it("rejects url that is too long", () => {
    const result = scanRequestSchema.safeParse({
      url: `https://example.com/${"a".repeat(2048)}`,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid timeout", () => {
    const result = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: { timeout: 500 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toMatch(/timeout/i);
    }
  });
});

describe("formatZodError", () => {
  it("joins multiple issue messages", () => {
    const error = new z.ZodError([
      { code: "custom", message: "first", path: [] },
      { code: "custom", message: "second", path: [] },
    ]);
    expect(formatZodError(error)).toBe("first; second");
  });
});
