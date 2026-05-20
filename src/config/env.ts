const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONCURRENT_SCANS = 2;
const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_JOB_RETENTION_MS = 3_600_000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 30_000;

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_PORT;
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_SCAN_TIMEOUT_MS;
  const timeout = Number.parseInt(value, 10);
  if (Number.isNaN(timeout) || timeout < 1000) {
    throw new Error(`Invalid SCAN_TIMEOUT_MS: ${value}`);
  }
  return timeout;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function parseApiKey(value: string | undefined, nodeEnv: string): string {
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  if (nodeEnv === "test") {
    return "test-api-key";
  }

  throw new Error("API_KEY is required");
}

export const config = {
  port: parsePort(process.env.PORT),
  host: process.env.HOST ?? DEFAULT_HOST,
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiKey: parseApiKey(process.env.API_KEY, process.env.NODE_ENV ?? "development"),
  scanTimeoutMs: parseTimeout(process.env.SCAN_TIMEOUT_MS),
  maxConcurrentScans: parsePositiveInt(
    process.env.MAX_CONCURRENT_SCANS,
    DEFAULT_MAX_CONCURRENT_SCANS,
    "MAX_CONCURRENT_SCANS"
  ),
  rateLimit: {
    max: parsePositiveInt(
      process.env.RATE_LIMIT_MAX,
      DEFAULT_RATE_LIMIT_MAX,
      "RATE_LIMIT_MAX"
    ),
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_LIMIT_WINDOW_MS,
      "RATE_LIMIT_WINDOW_MS"
    ),
  },
  jobRetentionMs: parsePositiveInt(
    process.env.JOB_RETENTION_MS,
    DEFAULT_JOB_RETENTION_MS,
    "JOB_RETENTION_MS"
  ),
  shutdownDrainMs: parsePositiveInt(
    process.env.SHUTDOWN_DRAIN_MS,
    DEFAULT_SHUTDOWN_DRAIN_MS,
    "SHUTDOWN_DRAIN_MS"
  ),
  sentryDsn: process.env.SENTRY_DSN?.trim() || undefined,
  playwright: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  },
} as const;

export type Config = typeof config;
