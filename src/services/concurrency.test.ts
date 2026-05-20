import { describe, expect, it } from "vitest";

import { ScanCapacityError, ScanSemaphore } from "./concurrency.js";

describe("ScanSemaphore", () => {
  it("limits concurrent acquisitions", () => {
    const semaphore = new ScanSemaphore(2);

    expect(semaphore.tryAcquire()).toBe(true);
    expect(semaphore.tryAcquire()).toBe(true);
    expect(semaphore.tryAcquire()).toBe(false);

    semaphore.release();
    expect(semaphore.tryAcquire()).toBe(true);
  });

  it("throws when at capacity during run", async () => {
    const semaphore = new ScanSemaphore(1);
    expect(semaphore.tryAcquire()).toBe(true);

    await expect(
      semaphore.run(async () => "unused"),
    ).rejects.toBeInstanceOf(ScanCapacityError);
  });
});
