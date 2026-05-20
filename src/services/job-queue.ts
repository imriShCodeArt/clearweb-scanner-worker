import { randomUUID } from "node:crypto";

import type { Config } from "../config/env.js";
import { extractScanPhase, mapErrorToResponse } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  recordScanCompleted,
  recordScanFailed,
  scansQueued,
} from "../lib/metrics.js";
import { captureScanFailure } from "../lib/sentry.js";
import { setScanProgressHandler } from "../lib/scanner/scan-progress.js";
import type { ScanRequest } from "../types/index.js";
import { getJobStore } from "./job-store.js";
import { getScanner } from "./scanner.js";

export class JobQueue {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly config: Config) {
    setScanProgressHandler((jobId, progress) => {
      getJobStore(this.config.jobRetentionMs).updateProgress(jobId, progress);
    });
  }

  get pendingCount(): number {
    return this.inFlight.size;
  }

  enqueue(request: ScanRequest): string {
    const jobId = randomUUID();
    const jobStore = getJobStore(this.config.jobRetentionMs);
    jobStore.create(jobId, request.url);

    const task = this.processJob(jobId, request).finally(() => {
      this.inFlight.delete(task);
      scansQueued.set(this.inFlight.size);
    });

    this.inFlight.add(task);
    scansQueued.set(this.inFlight.size);

    return jobId;
  }

  async drain(): Promise<void> {
    if (this.inFlight.size === 0) return;
    logger.info({ count: this.inFlight.size }, "Draining in-flight scan jobs");
    await Promise.allSettled([...this.inFlight]);
  }

  private async processJob(jobId: string, request: ScanRequest): Promise<void> {
    const jobStore = getJobStore(this.config.jobRetentionMs);
    const startedAt = Date.now();

    jobStore.markRunning(jobId);
    logger.info({ jobId, url: request.url, requestId: jobId }, "scan started");

    try {
      const scanner = getScanner();
      const result = await scanner.scan(request, jobId);
      jobStore.complete(jobId, result);

      const durationMs = Date.now() - startedAt;
      recordScanCompleted(durationMs);

      logger.info(
        {
          jobId,
          url: request.url,
          requestId: jobId,
          durationMs,
          score: result.score,
        },
        "scan completed"
      );
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const mapped = mapErrorToResponse(err);
      const phase = mapped.body.phase ?? extractScanPhase(mapped.body.message);

      jobStore.fail(jobId, {
        message: mapped.body.message,
        phase,
      });

      recordScanFailed(durationMs, phase);
      captureScanFailure({
        jobId,
        url: request.url,
        error: err,
        phase,
        durationMs,
      });

      logger.error(
        {
          jobId,
          url: request.url,
          requestId: jobId,
          durationMs,
          phase,
          err,
        },
        "scan failed"
      );
    }
  }
}

let jobQueueInstance: JobQueue | null = null;

export function getJobQueue(config: Config): JobQueue {
  if (!jobQueueInstance) {
    jobQueueInstance = new JobQueue(config);
  }
  return jobQueueInstance;
}

export async function drainJobQueue(): Promise<void> {
  if (jobQueueInstance) {
    await jobQueueInstance.drain();
  }
}

export function resetJobQueueForTests(): void {
  setScanProgressHandler(null);
  jobQueueInstance = null;
}
