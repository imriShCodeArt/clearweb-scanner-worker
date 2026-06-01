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

  it("throws PageLoadHttpError for 403", () => {
    expect(() =>
      assertSuccessfulPageLoad(403, "https://example.com"),
    ).toThrow(PageLoadHttpError);
  });
});
