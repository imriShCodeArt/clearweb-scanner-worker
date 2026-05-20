# Improvement Suggestions

Recommendations for the Clearweb Scanner Worker, ordered by impact. Items marked **Done** have already been implemented.

---

## High priority — before exposing publicly

### 1. Lock down the scan endpoint **Done**

Anyone who could reach the worker could trigger Playwright scans — both an abuse vector and an SSRF risk. Even with private-IP blocking in `url.ts`, attackers can still probe internal services via DNS rebinding or cloud metadata URLs.

Implemented:

- API key / bearer token auth on `POST /api/scan` (`Authorization: Bearer` or `X-Api-Key`)
- DNS resolution before scan — reject if any resolved IP is private, link-local, or metadata
- Rate limiting on the scan route

`/api/health` remains public for Docker healthchecks.

### 2. Limit concurrency **Done**

Each scan uses Playwright + Chromium. A few parallel requests can exhaust CPU/RAM on a small VPS.

Implemented:

- `MAX_CONCURRENT_SCANS` semaphore (default: 2)
- Returns `503 Service Unavailable` when at capacity

### 3. Reuse the browser **Done**

Launching Chromium per request adds several seconds of overhead and increases memory churn.

Implemented:

- Shared `BrowserPool` — one browser, fresh context/page per scan
- Context closed after each scan; browser closed on graceful shutdown

---

## Medium priority — production reliability

### 4. Async job model for long scans **Done**

Scans can run 15–30+ seconds. A synchronous HTTP request ties up the connection and makes timeouts fragile.

Implemented:

```
POST /api/scan  →  202 { jobId, status: "queued" }
GET  /api/scan/:jobId  →  { status, progress?, result?, error? }
```

In-memory job store with configurable retention (`JOB_RETENTION_MS`). Progress updates wired from the scanner phases.

### 5. Structured logging **Done**

**pino** + **pino-http** for JSON request logs with `x-request-id`, plus scan lifecycle logs (`scan started`, `scan completed`, `scan failed`) with `jobId`, `url`, `durationMs`, `score`, and `phase`.

### 6. Smarter error responses **Done**

Centralized error mapping in `src/lib/errors.ts`:

| Condition | Status |
|-----------|--------|
| Validation / SSRF | `400` |
| Auth failure | `401` |
| Rate limit | `429` |
| At capacity | `503` |
| Scan timeout | `504` |
| Other scan failure | `500` |

Responses include optional `phase` extracted from `[scan:phase]` error tags.

### 7. Make the screenshot optional **Done**

`options.includeScreenshot` (default: `false`). Set to `true` to include the JPEG data URL in results.

---

## Deployment & ops

### 8. Set Docker resource limits

Playwright needs headroom. In `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: "2"
```

Without limits, one runaway scan can affect the whole VPS.

### 9. Graceful shutdown for in-flight scans

`SIGTERM` closes the HTTP server but does not wait for active scans to finish. Track in-flight work and either drain or cancel cleanly on shutdown.

### 10. Observability

- `/api/health` is good — add `/api/health/ready` that verifies Chromium can launch
- Prometheus metrics: scan count, duration histogram, active scans, error rate
- Optional: push scan failures to Sentry

---

## Code & API polish

### 11. Request validation with Zod

Replace manual `body.url` checks with a schema — validates types, max URL length, timeout bounds, and gives consistent error messages.

### 12. Consolidate config

Timeout is split between `src/config/env.ts` and `src/config/scan.ts`. Merge into one config module to avoid drift.

### 13. Clean up dead code

- `persist.ts` — remove or wire up if the worker will write to the main app's database
- `getScanner()` singleton — simplify if it no longer holds meaningful state beyond the pool

### 14. Stronger tests

Current tests cover validation and security helpers. Add:

- Unit tests for edge cases in `url.ts` / `url-security.ts` (metadata IP, IPv6-mapped IPv4, etc.)
- One integration test against `https://example.com` (marked slow, optional in CI)
- Docker CI smoke test that hits `/api/scan`, not just `/api/health`

---

## Nice to have

| Idea | Why |
|------|-----|
| OpenAPI spec | Documents the rich scan response for the main app to consume |
| Scan result caching | Dedupe scans of the same URL within a TTL |
| Webhook callback | `POST /api/scan` with `{ url, callbackUrl }` — worker POSTs result when done |
| Multi-page crawl | Scan sitemap/homepage + linked pages (larger feature) |
| `scanId` + progress polling | Wire up the progress stub for a frontend audit page |

---

## Suggested order of work

1. ~~Auth + concurrency limit + DNS validation~~ **Done**
2. ~~Browser reuse~~ **Done**
3. ~~Structured logging + better error codes~~ **Done**
4. ~~Optional screenshot + async job API~~ **Done**
5. Zod validation *(API quality)*
6. Async job queue with Redis/BullMQ *(when scaling beyond single VPS)*
7. Docker resource limits + graceful shutdown *(deployment hardening)*
8. Observability metrics *(production monitoring)*

---

## Environment variables reference

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | *(required)* | Bearer token for scan requests |
| `MAX_CONCURRENT_SCANS` | `2` | Max parallel scans |
| `RATE_LIMIT_MAX` | `20` | Max scan requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `SCAN_TIMEOUT_MS` | `30000` | Scan time budget |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `JOB_RETENTION_MS` | `3600000` | How long completed jobs are kept (ms) |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Pino log level |
| `PLAYWRIGHT_HEADLESS` | `true` | Run browser headless |

See `.env.example` for the full list.
