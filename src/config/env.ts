const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONCURRENT_SCANS = 2;
const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_JOB_RETENTION_MS = 3_600_000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 30_000;
const MIN_PRODUCTION_API_KEY_LENGTH = 32;

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_PORT;
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function parseTimeout(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const timeout = Number.parseInt(value, 10);
  if (Number.isNaN(timeout) || timeout < 1000) {
    throw new Error(`Invalid ${name}: ${value}`);
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

function parseTrustProxy(value: string | undefined): boolean | number {
  if (!value) return false;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  const hops = Number.parseInt(value, 10);
  if (!Number.isNaN(hops) && hops >= 0) return hops;
  throw new Error(`Invalid TRUST_PROXY: ${value}`);
}

function parseApiKey(value: string | undefined, nodeEnv: string): string {
  if (value && value.trim().length > 0) {
    const apiKey = value.trim();
    const ciSmokeTest = process.env.CI === "true";
    if (
      nodeEnv === "production" &&
      !ciSmokeTest &&
      apiKey.length < MIN_PRODUCTION_API_KEY_LENGTH
    ) {
      throw new Error(
        `API_KEY must be at least ${MIN_PRODUCTION_API_KEY_LENGTH} characters in production`
      );
    }
    return apiKey;
  }

  if (nodeEnv === "test") {
    return "test-api-key";
  }

  throw new Error("API_KEY is required");
}

function parseOptionalSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const config = {
  port: parsePort(process.env.PORT),
  host: process.env.HOST ?? DEFAULT_HOST,
  nodeEnv,
  apiKey: parseApiKey(process.env.API_KEY, nodeEnv),
  metricsApiKey: parseOptionalSecret(process.env.METRICS_API_KEY),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  scanTimeoutMs: parseTimeout(
    process.env.SCAN_TIMEOUT_MS,
    DEFAULT_SCAN_TIMEOUT_MS,
    "SCAN_TIMEOUT_MS"
  ),
  scanNavigationTimeoutMs: parseTimeout(
    process.env.SCAN_NAVIGATION_TIMEOUT_MS ?? process.env.SCAN_TIMEOUT_MS,
    DEFAULT_SCAN_TIMEOUT_MS,
    "SCAN_NAVIGATION_TIMEOUT_MS"
  ),
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
  sentryDsn: parseOptionalSecret(process.env.SENTRY_DSN),
  playwright: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  },
} as const;

export type Config = typeof config;
