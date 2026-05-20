# Scanner API reference

Production base URL:

**`https://scanner.clearweb.co.il`**

All paths below are relative to that base (e.g. `POST https://scanner.clearweb.co.il/api/scan`).

For local development, use `http://localhost:3000` instead.

---

## Authentication

Scan endpoints require an API key on every request. Send either header:

| Header | Example |
|--------|---------|
| `Authorization` | `Bearer <API_KEY>` |
| `X-Api-Key` | `<API_KEY>` |

Missing or invalid keys return `401 Unauthorized`.

Health and metrics endpoints are unauthenticated by default on the worker, but in production they are typically **not exposed publicly** — only `/api/scan` is proxied through TLS at `scanner.clearweb.co.il`.

---

## Overview

Scanning is **asynchronous**:

1. `POST /api/scan` — submit a URL, receive a job ID (`202 Accepted`)
2. `GET /api/scan/:jobId` — poll until `status` is `completed` or `failed`

Job status flow: `queued` → `running` → `completed` | `failed`

Completed jobs are retained in memory for `JOB_RETENTION_MS` (default 1 hour), then return `404`.

---

## Endpoints

### `GET /api/health`

Liveness probe. Returns when the Node process is running.

**Auth:** none

**Response `200`**

```json
{
  "status": "ok",
  "uptime": 123.456,
  "version": "0.1.0"
}
```

---

### `GET /api/health/live`

Alias of `/api/health`.

**Auth:** none

---

### `GET /api/health/ready`

Readiness probe. Returns `200` when Chromium can launch; `503` during shutdown or if the browser is unavailable.

**Auth:** none

**Response `200`**

```json
{
  "status": "ready",
  "chromium": "ok"
}
```

**Response `503`**

```json
{
  "status": "not_ready",
  "reason": "chromium_unavailable",
  "message": "…"
}
```

`reason` may also be `shutting_down`.

---

### `GET /api/metrics`

Prometheus exposition format.

**Auth:** optional — when `METRICS_API_KEY` is set on the server, use the same Bearer / `X-Api-Key` auth as scan routes.

---

### `POST /api/scan`

Queue an accessibility scan.

**Auth:** required

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | `http` or `https` URL to scan (max 2048 chars). Bare domains get `https://` prepended. |
| `options` | object | no | Scan options |
| `options.timeout` | integer | no | Scan budget in ms (1000–120000). Default: server `SCAN_TIMEOUT_MS` (30000). |
| `options.includeScreenshot` | boolean | no | Include viewport JPEG as data URL in result. Default: `false`. |

**Example**

```json
{
  "url": "https://example.com",
  "options": {
    "timeout": 30000,
    "includeScreenshot": false
  }
}
```

**Response `202 Accepted`**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "url": "https://example.com"
}
```

**Error responses**

| Status | When |
|--------|------|
| `400` | Invalid body, URL, or SSRF-blocked target |
| `401` | Missing or invalid API key |
| `429` | Rate limit exceeded |
| `503` | At concurrent scan capacity or server shutting down |

Error body:

```json
{
  "error": "Bad Request",
  "message": "Human-readable detail",
  "phase": "optional-scan-phase"
}
```

---

### `GET /api/scan/:jobId`

Get job status, progress, result, or error.

**Auth:** required

**Path parameter:** `jobId` — UUID returned from `POST /api/scan`

**Response `200` — queued or running**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "url": "https://example.com",
  "createdAt": "2026-05-20T10:00:00.000Z",
  "updatedAt": "2026-05-20T10:00:05.000Z",
  "progress": {
    "phase": "goto",
    "percent": 38,
    "updatedAt": "2026-05-20T10:00:04.000Z"
  }
}
```

**Response `200` — completed**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "url": "https://example.com",
  "createdAt": "2026-05-20T10:00:00.000Z",
  "updatedAt": "2026-05-20T10:00:28.000Z",
  "result": {
    "url": "https://example.com",
    "normalizedUrl": "https://example.com",
    "title": "Example Domain",
    "statusCode": 200,
    "screenshotDataUrl": null,
    "violations": [],
    "passedRules": [],
    "manualRules": [],
    "notApplicableRules": [],
    "passesCount": 42,
    "incompleteCount": 3,
    "inapplicableCount": 10,
    "overlayDetected": false,
    "score": 100,
    "timestamp": "2026-05-20T10:00:28.000Z"
  }
}
```

**Response `200` — failed**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "url": "https://example.com",
  "createdAt": "2026-05-20T10:00:00.000Z",
  "updatedAt": "2026-05-20T10:00:30.000Z",
  "error": {
    "message": "[scan:timeout] Scan timed out after 30000ms",
    "phase": "timeout"
  }
}
```

**Error responses**

| Status | When |
|--------|------|
| `401` | Missing or invalid API key |
| `404` | Unknown or expired job ID |
| `429` | Rate limit exceeded |

---

## Result schema

### `result.score`

Integer **0–100**. Higher is better. Based on WCAG-mapped axe violations weighted by impact.

### `result.violations[]`

| Field | Type | Description |
|-------|------|-------------|
| `ruleId` | string | axe rule ID |
| `title` | string | Rule title |
| `description` | string \| null | Rule description |
| `impact` | string | `critical`, `serious`, `moderate`, or `minor` |
| `wcagCriteria` | string[] | WCAG success criteria IDs |
| `wcagLevel` | string \| null | `a`, `aa`, or `aaa` |
| `helpUrl` | string \| null | Deque help URL |
| `nodes` | array | Failing DOM nodes |

Each node:

| Field | Type |
|-------|------|
| `target` | string[] — CSS selectors |
| `htmlSnippet` | string \| null |
| `failureSummary` | string \| null |
| `xpath` | string \| null |

### `result.passedRules[]`, `manualRules[]`, `notApplicableRules[]`

Rule summaries with `ruleId`, `title`, `description`, `impact`, `wcagCriteria`, `wcagLevel`, `helpUrl`, `nodesChecked`, and `selectors`.

### `result.overlayDetected`

`true` when a cookie/consent overlay was detected on the page (informational).

---

## Rate limits and capacity

Default limits (configurable on the server):

| Limit | Default |
|-------|---------|
| Requests per window | 20 per 60 seconds |
| Concurrent scans | 2 |

When exceeded: `429 Too Many Requests` or `503 Service Unavailable` (at capacity).

---

## Production examples

### Bash — submit and poll

```bash
BASE=https://scanner.clearweb.co.il
API_KEY=your-api-key

JOB=$(curl -sf -X POST "$BASE/api/scan" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}')

JOB_ID=$(echo "$JOB" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).jobId)")

while true; do
  STATUS=$(curl -sf -H "Authorization: Bearer $API_KEY" "$BASE/api/scan/$JOB_ID")
  echo "$STATUS" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.status, j.progress?.phase ?? '', j.result?.score ?? j.error?.message ?? '')"
  echo "$STATUS" | grep -qE '"status":"(completed|failed)"' && break
  sleep 2
done
```

### PowerShell

```powershell
$Base = "https://scanner.clearweb.co.il"
$Headers = @{ Authorization = "Bearer $env:API_KEY" }

$job = Invoke-RestMethod -Method POST `
  -Uri "$Base/api/scan" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com"}'

do {
  Start-Sleep -Seconds 2
  $status = Invoke-RestMethod -Uri "$Base/api/scan/$($job.jobId)" -Headers $Headers
  Write-Host $status.status $status.progress.phase $status.result.score
} while ($status.status -notin @("completed", "failed"))

$status.result
```

### JavaScript (fetch)

```javascript
const BASE = "https://scanner.clearweb.co.il";
const headers = {
  Authorization: `Bearer ${process.env.API_KEY}`,
  "Content-Type": "application/json",
};

const { jobId } = await fetch(`${BASE}/api/scan`, {
  method: "POST",
  headers,
  body: JSON.stringify({ url: "https://example.com" }),
}).then((r) => r.json());

let job;
do {
  await new Promise((r) => setTimeout(r, 2000));
  job = await fetch(`${BASE}/api/scan/${jobId}`, { headers }).then((r) => r.json());
} while (!["completed", "failed"].includes(job.status));

console.log(job.result?.score ?? job.error);
```

---

## Integrating with Clearweb

Configure your main app with:

| Setting | Value |
|---------|-------|
| Scanner base URL | `https://scanner.clearweb.co.il` |
| API key | Shared secret from server `.env` (`API_KEY`) |

Typical flow:

1. User requests an audit in Clearweb
2. Backend calls `POST /api/scan` with the target URL
3. Backend polls `GET /api/scan/:jobId` until complete
4. Store `result.score`, `result.violations`, and related fields in your database

Poll every **2–3 seconds**. Most scans finish in **15–45 seconds**.
