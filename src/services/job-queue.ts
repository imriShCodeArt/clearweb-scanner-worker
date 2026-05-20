import { randomUUID } from "node:crypto";

import type { Config } from "../config/env.js";
import { extractScanPhase, mapErrorToResponse } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { setScanProgressHandler } from "../lib/scanner/scan-progress.js";
import type { ScanRequest } from "../types/index.js";
import { getJobStore } from "./job-store.js";
import { getScanner } from "./scanner.js";

export class JobQueue {
  constructor(private readonly config: Config) {
    setScanProgressHandler((jobId, progress) => {
      getJobStore(this.config.jobRetentionMs).updateProgress(jobId, progress);
    });
  }

  enqueue(request: ScanRequest): string {
    const jobId = randomUUID();
    const jobStore = getJobStore(this.config.jobRetentionMs);
    jobStore.create(jobId, request.url);

    void this.processJob(jobId, request);

    return jobId;
  }

  private async processJob(jobId: string, request: ScanRequest): Promise<void> {
    const jobStore = getJobStore(this.config.jobRetentionMs);
    const startedAt = Date.now();

    jobStore.markRunning(jobId);
    logger.info({ jobId, url: request.url, requestId: jobId }, "scan started");

    try {
      const scanner = getScanner(this.config);
      const result = await scanner.scan(request, jobId);
      jobStore.complete(jobId, result);

      logger.info(
        {
          jobId,
          url: request.url,
          requestId: jobId,
          durationMs: Date.now() - startedAt,
          score: result.score,
        },
        "scan completed"
      );
    } catch (err) {
      const mapped = mapErrorToResponse(err);
      jobStore.fail(jobId, {
        message: mapped.body.message,
        phase: mapped.body.phase,
      });

      logger.error(
        {
          jobId,
          url: request.url,
          requestId: jobId,
          durationMs: Date.now() - startedAt,
          phase: mapped.body.phase ?? extractScanPhase(mapped.body.message),
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

export function resetJobQueueForTests(): void {
  setScanProgressHandler(null);
  jobQueueInstance = null;
}
