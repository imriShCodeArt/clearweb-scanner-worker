/**
 * Structured logging when a background scan fails. Use Vercel/host logs or
 * `next dev` output to correlate scanId with stack traces.
 */
export interface LogScanFailureParams {
  scanId: string;
  targetUrl: string;
  err: unknown;
}

function serializeCause(err: unknown, depth = 0): unknown {
  if (depth > 3) return '[max depth]';
  if (!(err instanceof Error)) return err;
  const cause =
    'cause' in err ? (err as Error & { cause?: unknown }).cause : undefined;
  if (cause === undefined || cause === null) return undefined;
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
      cause: serializeCause(cause, depth + 1),
    };
  }
  return String(cause);
}

/**
 * Writes one JSON log line (plus stack on stderr for readability in local dev).
 * Returns a message suitable for `scans.error_message` (same as `Error.message` when present).
 */
export function logScanFailure(params: LogScanFailureParams): string {
  const { scanId, targetUrl, err } = params;
  const name = err instanceof Error ? err.name : 'NonError';
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const cause = err instanceof Error ? serializeCause(err) : undefined;

  const payload = {
    scanId,
    targetUrl,
    name,
    message,
    ...(stack ? { stack } : {}),
    ...(cause ? { cause } : {}),
    at: new Date().toISOString(),
  };

  console.error('[a11y-scan-failed]', JSON.stringify(payload));

  return message;
}
