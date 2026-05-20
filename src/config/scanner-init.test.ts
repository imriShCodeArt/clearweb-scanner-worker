import { describe, expect, it } from "vitest";

import { config } from "./env.js";
import {
  getScanner,
  initScanner,
  resetScannerForTests,
} from "../services/scanner.js";

describe("scanner initialization", () => {
  it("requires initScanner before getScanner", () => {
    resetScannerForTests();
    expect(() => getScanner()).toThrow(/not initialized/);
  });

  it("returns the same instance from initScanner", () => {
    resetScannerForTests();
    const first = initScanner(config);
    const second = initScanner(config);
    expect(first).toBe(second);
    expect(getScanner()).toBe(first);
    resetScannerForTests();
  });
});
