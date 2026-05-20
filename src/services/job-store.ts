import type { ScanProgressJson } from "../lib/scanner/scan-progress.js";
import type { ScanResponse } from "../types/index.js";

export type ScanJobStatus = "queued" | "running" | "completed" | "failed";

export interface ScanJobError {
  message: string;
  phase?: string;
}

export interface ScanJobRecord {
  jobId: string;
  status: ScanJobStatus;
  url: string;
  createdAt: string;
  updatedAt: string;
  progress?: ScanProgressJson;
  result?: ScanResponse;
  error?: ScanJobError;
}

export class JobStore {
  private readonly jobs = new Map<string, ScanJobRecord>();

  constructor(private readonly retentionMs: number) {}

  create(jobId: string, url: string): ScanJobRecord {
    this.purgeExpired();

    const now = new Date().toISOString();
    const job: ScanJobRecord = {
      jobId,
      status: "queued",
      url,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);
    return job;
  }

  get(jobId: string): ScanJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  markRunning(jobId: string): ScanJobRecord | undefined {
    return this.update(jobId, { status: "running" });
  }

  updateProgress(
    jobId: string,
    progress: Pick<ScanProgressJson, "phase" | "percent">
  ): ScanJobRecord | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    return this.update(jobId, {
      progress: {
        phase: progress.phase,
        percent: progress.percent,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  complete(jobId: string, result: ScanResponse): ScanJobRecord | undefined {
    return this.update(jobId, {
      status: "completed",
      result,
      progress: undefined,
      error: undefined,
    });
  }

  fail(jobId: string, error: ScanJobError): ScanJobRecord | undefined {
    return this.update(jobId, {
      status: "failed",
      error,
      progress: undefined,
    });
  }

  purgeExpired(): void {
    const cutoff = Date.now() - this.retentionMs;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === "running" || job.status === "queued") continue;

      const updatedAt = Date.parse(job.updatedAt);
      if (!Number.isNaN(updatedAt) && updatedAt < cutoff) {
        this.jobs.delete(jobId);
      }
    }
  }

  clear(): void {
    this.jobs.clear();
  }

  private update(
    jobId: string,
    patch: Partial<ScanJobRecord>
  ): ScanJobRecord | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const updated: ScanJobRecord = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, updated);
    return updated;
  }
}

let jobStoreInstance: JobStore | null = null;

export function getJobStore(retentionMs: number): JobStore {
  if (!jobStoreInstance) {
    jobStoreInstance = new JobStore(retentionMs);
  }
  return jobStoreInstance;
}

export function resetJobStoreForTests(): void {
  jobStoreInstance?.clear();
  jobStoreInstance = null;
}
