import * as Sentry from "@sentry/node";

import { config } from "../config/env.js";
import { logger } from "./logger.js";

let initialized = false;

export function initSentry(): void {
  if (!config.sentryDsn || initialized) return;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    tracesSampleRate: config.nodeEnv === "production" ? 0.1 : 1,
  });

  initialized = true;
  logger.info("Sentry initialized");
}

export function captureScanFailure(params: {
  jobId: string;
  url: string;
  error: unknown;
  phase?: string;
  durationMs: number;
}): void {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    scope.setTag("jobId", params.jobId);
    scope.setTag("scan.phase", params.phase ?? "unknown");
    scope.setExtra("url", params.url);
    scope.setExtra("durationMs", params.durationMs);
    Sentry.captureException(params.error);
  });
}

export function resetSentryForTests(): void {
  initialized = false;
}
