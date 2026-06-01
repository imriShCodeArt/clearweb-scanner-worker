import { ScanCapacityError } from "../services/concurrency.js";
import { PageLoadHttpError } from "./scanner/page-load.js";
import { ScanUrlError } from "./scanner/url.js";
import { ScanTimeoutError } from "./scanner/scan-timeout.js";

export interface ApiErrorResponse {
  error: string;
  message: string;
  phase?: string;
}

const SCAN_PHASE_PATTERN = /\[scan:([^\]]+)\]/;

export function extractScanPhase(message: string): string | undefined {
  const match = message.match(SCAN_PHASE_PATTERN);
  return match?.[1];
}

export function mapErrorToResponse(err: unknown): {
  status: number;
  body: ApiErrorResponse;
} {
  if (err instanceof ScanUrlError) {
    return {
      status: 400,
      body: { error: "Bad Request", message: err.message },
    };
  }

  if (err instanceof ScanCapacityError) {
    return {
      status: 503,
      body: { error: "Service Unavailable", message: err.message },
    };
  }

  if (err instanceof ScanTimeoutError) {
    return {
      status: 504,
      body: {
        error: "Gateway Timeout",
        message: err.message,
        phase: "timeout",
      },
    };
  }

  if (err instanceof PageLoadHttpError) {
    return {
      status: 502,
      body: {
        error: "Bad Gateway",
        message: err.message,
        phase: "page_load",
      },
    };
  }

  const message = err instanceof Error ? err.message : "Unknown scan error";
  const phase = extractScanPhase(message);

  if (phase === "timeout") {
    return {
      status: 504,
      body: {
        error: "Gateway Timeout",
        message,
        phase,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal Server Error",
      message,
      ...(phase ? { phase } : {}),
    },
  };
}
