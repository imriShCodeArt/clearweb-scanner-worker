import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

export const metricsRegister = new Registry();

collectDefaultMetrics({ register: metricsRegister });

export const scansTotal = new Counter({
  name: "scanner_scans_total",
  help: "Total number of scan jobs processed",
  labelNames: ["status"] as const,
  registers: [metricsRegister],
});

export const scanErrorsTotal = new Counter({
  name: "scanner_scan_errors_total",
  help: "Total number of failed scan jobs",
  labelNames: ["phase"] as const,
  registers: [metricsRegister],
});

export const scanDurationSeconds = new Histogram({
  name: "scanner_scan_duration_seconds",
  help: "Scan job duration in seconds",
  buckets: [1, 5, 10, 15, 30, 45, 60, 90, 120],
  registers: [metricsRegister],
});

export const scansActive = new Gauge({
  name: "scanner_scans_active",
  help: "Number of scans currently running",
  registers: [metricsRegister],
});

export const scansQueued = new Gauge({
  name: "scanner_scans_queued",
  help: "Number of scan jobs waiting to start",
  registers: [metricsRegister],
});

export function recordScanCompleted(durationMs: number): void {
  scansTotal.inc({ status: "completed" });
  scanDurationSeconds.observe(durationMs / 1000);
}

export function recordScanFailed(durationMs: number, phase?: string): void {
  scansTotal.inc({ status: "failed" });
  scanDurationSeconds.observe(durationMs / 1000);
  scanErrorsTotal.inc({ phase: phase ?? "unknown" });
}

export async function getMetricsSnapshot(): Promise<string> {
  return metricsRegister.metrics();
}
