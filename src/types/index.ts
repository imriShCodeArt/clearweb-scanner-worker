import type {
  PageScanResult,
  ScanRuleSummary,
  ScanViolation,
  ScanViolationNode,
} from "../lib/scanner/axe.js";
import type { ScanProgressJson } from "../lib/scanner/scan-progress.js";

export interface ScanRequest {
  url: string;
  options?: ScanOptions;
}

export interface ScanOptions {
  /** Maximum scan budget in milliseconds */
  timeout?: number;
  /** Capture a viewport JPEG screenshot in the result (default: false) */
  includeScreenshot?: boolean;
}

export type { ScanViolation, ScanViolationNode, ScanRuleSummary, PageScanResult };

export interface ScanResponse extends PageScanResult {
  score: number;
  timestamp: string;
}

export type ScanJobStatus = "queued" | "running" | "completed" | "failed";

export interface ScanJobError {
  message: string;
  phase?: string;
}

export interface ScanJobResponse {
  jobId: string;
  status: ScanJobStatus;
  url: string;
  createdAt: string;
  updatedAt: string;
  progress?: ScanProgressJson;
  result?: ScanResponse;
  error?: ScanJobError;
}

export interface ScanJobCreatedResponse {
  jobId: string;
  status: "queued";
  url: string;
}

export interface HealthResponse {
  status: "ok";
  uptime: number;
  version: string;
}

export interface ReadyResponse {
  status: "ready" | "not_ready";
  chromium?: "ok";
  reason?: "shutting_down" | "chromium_unavailable";
  message?: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  phase?: string;
}
