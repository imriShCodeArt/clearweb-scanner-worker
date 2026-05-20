export class ScanCapacityError extends Error {
  constructor(message = "Scanner at capacity. Try again later.") {
    super(message);
    this.name = "ScanCapacityError";
  }
}

export class ScanSemaphore {
  private active = 0;

  constructor(private readonly maxConcurrent: number) {}

  get activeCount(): number {
    return this.active;
  }

  tryAcquire(): boolean {
    if (this.active >= this.maxConcurrent) {
      return false;
    }

    this.active += 1;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.tryAcquire()) {
      throw new ScanCapacityError();
    }

    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
