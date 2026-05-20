# Clearweb Scanner Worker

Containerized Node.js worker that scans websites for accessibility (a11y) issues using Playwright and axe-core.

**Production API:** [https://scanner.clearweb.co.il](https://scanner.clearweb.co.il)

Full API reference: **[docs/API.md](./docs/API.md)**

## Stack

- Node.js 24
- TypeScript
- Express 5
- Playwright (Chromium)
- @axe-core/playwright
- Docker

## Production usage

Base URL: `https://scanner.clearweb.co.il`

All scan routes require `Authorization: Bearer <API_KEY>` or `X-Api-Key`.

```bash
# Queue a scan
curl -X POST https://scanner.clearweb.co.il/api/scan \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Poll for results (replace <jobId>)
curl -H "Authorization: Bearer $API_KEY" \
  https://scanner.clearweb.co.il/api/scan/<jobId>
```

See [docs/API.md](./docs/API.md) for request/response schemas, error codes, and integration examples (Bash, PowerShell, JavaScript).

## Local development

```bash
yarn install
cp .env.example .env
# Set API_KEY in .env before starting
yarn dev
```

Local base URL: `http://localhost:3000`

```bash
curl http://localhost:3000/api/health
```

PowerShell (local):

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

## API summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Liveness |
| `GET` | `/api/health/ready` | No | Readiness (Chromium) |
| `GET` | `/api/metrics` | Optional | Prometheus metrics |
| `POST` | `/api/scan` | Yes | Queue scan → `202` + `jobId` |
| `GET` | `/api/scan/:jobId` | Yes | Poll status, progress, result |

Job lifecycle: `queued` → `running` → `completed` | `failed`

Completed results include axe violations, rule summaries, accessibility score (0–100), page metadata, and optional screenshot.

**HTTP status codes:** `400` validation/SSRF · `401` auth · `404` unknown job · `429` rate limit · `503` at capacity · `504` scan timeout (failed job)

Details, field definitions, and production examples: **[docs/API.md](./docs/API.md)**

## Security

- Scan routes require API key authentication
- URLs are validated and DNS-resolved before scanning (SSRF protection)
- Rate limiting and concurrent scan caps protect the server from overload
- Production binds to `127.0.0.1` on the VPS; public access is via TLS reverse proxy only
- Chromium is reused across scans (one browser, fresh context per request)

## Docker

Set `API_KEY` in `.env` (at least 32 characters for production), then:

```bash
docker compose up --build
```

For VPS deployment (GHCR, GitHub Actions, nginx), see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start dev server with hot reload |
| `yarn build` | Compile TypeScript to `dist/` |
| `yarn start` | Run production build |
| `yarn lint` | ESLint |
| `yarn typecheck` | TypeScript check |
| `yarn test` | Run unit tests |
| `yarn test:integration` | Playwright scan against example.com (`RUN_INTEGRATION_TESTS=true`) |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Container HTTP port |
| `HOST` | `0.0.0.0` | Container bind address |
| `HOST_PORT` | `3000` | Host port in Docker Compose (`127.0.0.1:HOST_PORT:3000`) |
| `BIND_HOST` | `127.0.0.1` | Host bind address in Docker Compose |
| `NODE_ENV` | `development` | Environment |
| `API_KEY` | *(required)* | Bearer token for scan requests (min 32 chars in production) |
| `METRICS_API_KEY` | *(optional)* | When set, protects `GET /api/metrics` |
| `TRUST_PROXY` | `false` | Set `1`/`true` or hop count when behind a reverse proxy |
| `SCAN_TIMEOUT_MS` | `30000` | Scan time budget |
| `MAX_CONCURRENT_SCANS` | `2` | Max parallel scans |
| `RATE_LIMIT_MAX` | `20` | Max scan requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `JOB_RETENTION_MS` | `3600000` | How long completed jobs are kept (ms) |
| `SHUTDOWN_DRAIN_MS` | `30000` | Graceful shutdown drain timeout (ms) |
| `SENTRY_DSN` | *(optional)* | Sentry DSN for scan failure reporting |
| `LOG_LEVEL` | `info` / `debug` | Pino log level |
| `PLAYWRIGHT_HEADLESS` | `true` | Run browser headless |

See [.env.example](./.env.example) for the full list.

## CI

GitHub Actions runs lint, typecheck, build, tests, and a Docker smoke test on push/PR to `main`. Pushes to `main` publish a container image to GHCR and can auto-deploy to the VPS — see [DEPLOYMENT.md](./DEPLOYMENT.md).
