import { describe, expect, it } from "vitest";

import { ScanCapacityError } from "../services/concurrency.js";
import { ScanTimeoutError } from "./scanner/scan-timeout.js";
import { ScanUrlError } from "./scanner/url.js";
import { extractScanPhase, mapErrorToResponse } from "./errors.js";

describe("mapErrorToResponse", () => {
  it("maps validation errors to 400", () => {
    const mapped = mapErrorToResponse(new ScanUrlError("bad url"));
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toBe("Bad Request");
  });

  it("maps capacity errors to 503", () => {
    const mapped = mapErrorToResponse(new ScanCapacityError());
    expect(mapped.status).toBe(503);
  });

  it("maps timeout errors to 504", () => {
    const mapped = mapErrorToResponse(new ScanTimeoutError(30_000));
    expect(mapped.status).toBe(504);
    expect(mapped.body.phase).toBe("timeout");
  });

  it("extracts scan phases from error messages", () => {
    expect(extractScanPhase("[scan:goto] Timeout 30000ms exceeded")).toBe(
      "goto"
    );
  });

  it("maps phase-tagged errors to 500 with phase metadata", () => {
    const mapped = mapErrorToResponse(
      new Error("[scan:axe_analyze] Something went wrong")
    );
    expect(mapped.status).toBe(500);
    expect(mapped.body.phase).toBe("axe_analyze");
  });
});
