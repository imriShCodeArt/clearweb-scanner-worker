import { describe, expect, it } from "vitest";

import {
  assertSuccessfulPageLoad,
  isSuccessfulPageLoad,
  PageLoadHttpError,
} from "./page-load.js";

describe("page-load", () => {
  it("detects successful loads", () => {
    expect(isSuccessfulPageLoad(200)).toBe(true);
    expect(isSuccessfulPageLoad(403)).toBe(false);
  });

  it("accepts all 2xx codes", () => {
    expect(isSuccessfulPageLoad(201)).toBe(true);
    expect(isSuccessfulPageLoad(204)).toBe(true);
    expect(isSuccessfulPageLoad(299)).toBe(true);
  });

  it("rejects redirect codes (3xx) — final status must be 2xx", () => {
    expect(isSuccessfulPageLoad(301)).toBe(false);
    expect(isSuccessfulPageLoad(307)).toBe(false);
    expect(isSuccessfulPageLoad(308)).toBe(false);
  });

  it("throws PageLoadHttpError for 403", () => {
    expect(() =>
      assertSuccessfulPageLoad(403, "https://example.com"),
    ).toThrow(PageLoadHttpError);
  });

  it("throws PageLoadHttpError for 307 (redirect — listener should have resolved to final status)", () => {
    expect(() =>
      assertSuccessfulPageLoad(307, "https://example.com"),
    ).toThrow(PageLoadHttpError);
  });

  it("throws PageLoadHttpError when statusCode is 0 (no response captured)", () => {
    expect(() =>
      assertSuccessfulPageLoad(0, "https://example.com"),
    ).toThrow(PageLoadHttpError);
  });
});
