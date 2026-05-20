# Clearweb Scanner Worker

Containerized Node.js worker that scans websites for accessibility (a11y) issues using Playwright and axe-core.

## Stack

- Node.js 24
- TypeScript
- Express 5
- Playwright (Chromium)
- @axe-core/playwright
- Docker

## Quick start

```bash
yarn install
cp .env.example .env
# Set API_KEY in .env before starting
yarn dev
```

Health check (no auth): `GET http://localhost:3000/api/health`

Scan a URL (requires API key) — returns immediately with a job ID:

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","options":{"includeScreenshot":true}}'
```

Poll for results:

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/scan/<jobId>
```

PowerShell:

```powershell
$job = Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/scan" `
  -Headers @{ Authorization = "Bearer $env:API_KEY" } `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com"}'

Invoke-RestMethod `
  -Uri "http://localhost:3000/api/scan/$($job.jobId)" `
  -Headers @{ Authorization = "Bearer $env:API_KEY" }
```

Job status progresses through `queued` → `running` → `completed` or `failed`. Completed jobs include full axe results, score (0–100), and optional screenshot.

## Security

- `POST /api/scan` requires `Authorization: Bearer <API_KEY>` or `X-Api-Key`
- URLs are validated and DNS-resolved before scanning (SSRF protection)
- Rate limiting and concurrent scan caps protect the VPS from overload
- Chromium is reused across scans (one browser, fresh context per request)

## Docker

Set `API_KEY` in `.env`, then:

```bash
docker compose up --build
```

## Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start dev server with hot reload |
| `yarn build` | Compile TypeScript to `dist/` |
| `yarn start` | Run production build |
| `yarn lint` | ESLint |
| `yarn typecheck` | TypeScript check |
| `yarn test` | Run tests |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Environment |
| `API_KEY` | *(required)* | Bearer token for scan requests |
| `SCAN_TIMEOUT_MS` | `30000` | Scan time budget |
| `MAX_CONCURRENT_SCANS` | `2` | Max parallel scans |
| `RATE_LIMIT_MAX` | `20` | Max scan requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `JOB_RETENTION_MS` | `3600000` | How long completed jobs are kept (ms) |
| `LOG_LEVEL` | `info` / `debug` | Pino log level |
| `PLAYWRIGHT_HEADLESS` | `true` | Run browser headless |

## API

### `GET /api/health`

Returns service health and uptime. No authentication required.

### `POST /api/scan`

Requires API key header. Returns `202 Accepted` with a job ID.

```json
{
  "url": "https://example.com",
  "options": {
    "timeout": 30000,
    "includeScreenshot": false
  }
}
```

Response:

```json
{
  "jobId": "…",
  "status": "queued",
  "url": "https://example.com"
}
```

### `GET /api/scan/:jobId`

Requires API key header. Returns job status, progress, result, or error.

Completed `result` includes `violations`, `passedRules`, `manualRules`, `notApplicableRules`, `score`, `overlayDetected`, and related page metadata.

Error codes: `400` validation/SSRF, `401` auth, `404` unknown job, `429` rate limit, `503` at capacity. Failed jobs include `error.phase` and `error.message` (e.g. timeout → phase `timeout`).

## CI

GitHub Actions runs lint, typecheck, build, tests, and a Docker smoke test on push/PR to `main`.
