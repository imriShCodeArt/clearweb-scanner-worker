import { beforeEach, describe, expect, it } from "vitest";

import type { ScanResponse } from "../types/index.js";
import { JobStore } from "./job-store.js";

const mockResult = { score: 95 } as ScanResponse;

describe("JobStore", () => {
  let store: JobStore;

  beforeEach(() => {
    store = new JobStore(60_000);
  });

  it("creates and retrieves queued jobs", () => {
    const job = store.create("job-1", "https://example.com");

    expect(job.status).toBe("queued");
    expect(store.get("job-1")?.url).toBe("https://example.com");
  });

  it("tracks progress and completion", () => {
    store.create("job-1", "https://example.com");
    store.markRunning("job-1");
    store.updateProgress("job-1", { phase: "goto", percent: 38 });
    store.complete("job-1", mockResult);

    const job = store.get("job-1");
    expect(job?.status).toBe("completed");
    expect(job?.result?.score).toBe(95);
    expect(job?.progress).toBeUndefined();
  });

  it("records failures with error metadata", () => {
    store.create("job-1", "https://example.com");
    store.fail("job-1", { message: "timeout", phase: "timeout" });

    expect(store.get("job-1")).toMatchObject({
      status: "failed",
      error: { message: "timeout", phase: "timeout" },
    });
  });
});
