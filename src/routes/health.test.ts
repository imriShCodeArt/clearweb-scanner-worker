import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const verifyReadyMock = vi.hoisted(() => vi.fn());

vi.mock("../services/scanner.js", () => ({
  getScanner: () => ({
    verifyReady: verifyReadyMock,
    scan: vi.fn(),
    close: vi.fn(),
    getActiveScanCount: () => 0,
  }),
  closeScanner: vi.fn(),
  resetScannerForTests: vi.fn(),
}));

import { createApp } from "../app.js";
import { config } from "../config/env.js";
import { resetShutdownStateForTests } from "../services/shutdown.js";

describe("health endpoints", () => {
  beforeEach(() => {
    resetShutdownStateForTests();
    verifyReadyMock.mockReset();
    verifyReadyMock.mockResolvedValue(undefined);
  });

  const app = createApp(config);

  it("returns liveness from /api/health", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("returns readiness when chromium is available", async () => {
    const response = await request(app).get("/api/health/ready");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ready",
      chromium: "ok",
    });
  });

  it("returns 503 readiness when chromium check fails", async () => {
    verifyReadyMock.mockRejectedValue(new Error("launch failed"));

    const response = await request(app).get("/api/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.reason).toBe("chromium_unavailable");
  });

  it("exposes prometheus metrics", async () => {
    const response = await request(app).get("/api/metrics");
    expect(response.status).toBe(200);
    expect(response.text).toContain("scanner_scans_total");
  });
});
