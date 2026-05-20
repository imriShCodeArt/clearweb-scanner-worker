import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const scanMock = vi.hoisted(() => vi.fn());

vi.mock("./services/scanner.js", () => ({
  getScanner: () => ({
    scan: scanMock,
    close: vi.fn(),
  }),
  closeScanner: vi.fn(),
  resetScannerForTests: vi.fn(),
}));

import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { resetJobQueueForTests } from "./services/job-queue.js";
import { resetJobStoreForTests } from "./services/job-store.js";
import type { ScanResponse } from "./types/index.js";

const authHeader = { Authorization: `Bearer ${config.apiKey}` };

const mockScanResult: ScanResponse = {
  url: "https://example.com",
  normalizedUrl: "https://example.com",
  title: "Example",
  statusCode: 200,
  screenshotDataUrl: null,
  violations: [],
  passedRules: [],
  manualRules: [],
  notApplicableRules: [],
  passesCount: 0,
  incompleteCount: 0,
  inapplicableCount: 0,
  overlayDetected: false,
  score: 100,
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("health endpoint", () => {
  const app = createApp(config);

  it("returns ok status without auth", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      version: "0.1.0",
    });
  });
});

describe("scan endpoint", () => {
  beforeEach(() => {
    resetJobStoreForTests();
    resetJobQueueForTests();
    scanMock.mockReset();
    scanMock.mockResolvedValue(mockScanResult);
  });

  const app = createApp(config);

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .post("/api/scan")
      .send({ url: "https://example.com" });

    expect(response.status).toBe(401);
  });

  it("rejects missing url", async () => {
    const response = await request(app)
      .post("/api/scan")
      .set(authHeader)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("url");
  });

  it("rejects invalid url", async () => {
    const response = await request(app)
      .post("/api/scan")
      .set(authHeader)
      .send({ url: "@@@" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("not a valid URL");
  });

  it("rejects private addresses", async () => {
    const response = await request(app)
      .post("/api/scan")
      .set(authHeader)
      .send({ url: "http://localhost" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("private or loopback");
  });

  it("queues a scan job and returns 202", async () => {
    const response = await request(app)
      .post("/api/scan")
      .set(authHeader)
      .send({ url: "https://example.com" });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      status: "queued",
      url: "https://example.com",
    });
    expect(typeof response.body.jobId).toBe("string");
  });

  it("returns job status and result", async () => {
    const created = await request(app)
      .post("/api/scan")
      .set(authHeader)
      .send({ url: "https://example.com" });

    await vi.waitFor(async () => {
      const status = await request(app)
        .get(`/api/scan/${created.body.jobId}`)
        .set(authHeader);

      expect(status.body.status).toBe("completed");
      expect(status.body.result?.score).toBe(100);
    });
  });

  it("returns 404 for unknown jobs", async () => {
    const response = await request(app)
      .get("/api/scan/00000000-0000-0000-0000-000000000000")
      .set(authHeader);

    expect(response.status).toBe(404);
  });
});
