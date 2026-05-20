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

**Frontend apps:** never call this API directly from the browser with the API key. Proxy through your backend (Next.js API route, server action, etc.) and expose your own endpoints to the client.

Health and metrics endpoints are unauthenticated by default on the worker, but in production they are typically **not exposed publicly** — only `/api/scan` is proxied through TLS at `scanner.clearweb.co.il` (this matches both `POST /api/scan` and `GET /api/scan/:jobId`).

---

## Overview

Scanning is **asynchronous**:

1. `POST /api/scan` — submit a URL, receive a job ID (`202 Accepted`)
2. `GET /api/scan/:jobId` — poll until `status` is `completed` or `failed`

Job status flow: `queued` → `running` → `completed` | `failed`

Completed jobs are retained in memory for `JOB_RETENTION_MS` (default 1 hour), then return `404`.

Poll every **2–3 seconds**. Most scans finish in **15–45 seconds**.

### Response fields by job status

| `status` | `progress` | `result` | `error` |
|----------|------------|----------|---------|
| `queued` | optional | absent | absent |
| `running` | optional | absent | absent |
| `completed` | absent | present | absent |
| `failed` | absent | absent | present |

Scan failures are returned as **`200` with `status: "failed"`** on `GET /api/scan/:jobId`, not as `504` on the poll endpoint.

---

## TypeScript contract

Copy-paste types matching the server implementation:

```typescript
// --- Request / create ---

interface ScanRequest {
  url: string; // required, 1–2048 chars, http/https only
  options?: {
    timeout?: number; // int, 1000–120000 ms (default: server 30000)
    includeScreenshot?: boolean; // default false
  };
}

interface ScanJobCreatedResponse {
  jobId: string; // UUID v4
  status: "queued";
  url: string;
}

// --- Poll ---

type ScanJobStatus = "queued" | "running" | "completed" | "failed";

interface ScanJobResponse {
  jobId: string;
  status: ScanJobStatus;
  url: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  progress?: ScanProgress; // only while queued/running
  result?: ScanResult; // only when status === "completed"
  error?: ScanJobError; // only when status === "failed"
}

interface ScanProgress {
  phase: string;
  percent: number; // 0–100
  updatedAt: string; // ISO 8601
}

interface ScanJobError {
  message: string;
  phase?: string; // e.g. "timeout", "goto", "axe_analyze"
}

// --- Result (status === "completed") ---

interface ScanResult {
  url: string;
  normalizedUrl: string;
  title: string;
  statusCode: number;
  screenshotDataUrl: string | null; // "data:image/jpeg;base64,..." when requested
  violations: ScanViolation[];
  passedRules: ScanRuleSummary[];
  manualRules: ScanRuleSummary[];
  notApplicableRules: ScanRuleSummary[];
  passesCount: number;
  incompleteCount: number;
  inapplicableCount: number;
  overlayDetected: boolean;
  score: number; // 0–100, higher is better
  timestamp: string; // ISO 8601
}

interface ScanViolation {
  ruleId: string;
  title: string;
  description: string | null;
  impact: "critical" | "serious" | "moderate" | "minor";
  wcagCriteria: string[];
  wcagLevel: "a" | "aa" | "aaa" | null;
  helpUrl: string | null;
  nodes: ScanViolationNode[];
}

interface ScanViolationNode {
  target: string[]; // CSS selectors
  htmlSnippet: string | null;
  failureSummary: string | null;
  xpath: string | null;
}

interface ScanRuleSummary {
  ruleId: string;
  title: string;
  description: string | null;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  wcagCriteria: string[];
  wcagLevel: "a" | "aa" | "aaa" | null;
  helpUrl: string | null;
  nodesChecked: number;
  selectors: string[];
}

// --- Errors (non-2xx on POST, or poll errors) ---

interface ErrorResponse {
  error: string;
  message: string;
  phase?: string;
}
```

### Progress phases (while `running`)

| `progress.phase` | ~`percent` |
|------------------|------------|
| `launch_browser` | 12 |
| `browser_context` | 18 |
| `new_page` | 24 |
| `goto` | 38 |
| `page_prepare` | 52 |
| `screenshot` | 62 |
| `axe_analyze` | 68–75 |

Use `progress.percent` for a progress bar. `progress` is cleared when the job completes or fails.

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

| Status | `error` | When |
|--------|---------|------|
| `400` | `Bad Request` | Invalid body, URL, or SSRF-blocked target |
| `401` | `Unauthorized` | Missing or invalid API key |
| `429` | `Too Many Requests` | Rate limit exceeded |
| `503` | `Service Unavailable` | At concurrent scan capacity or server shutting down |

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

Rate-limited responses include standard headers:

```http
RateLimit-Limit: 20
RateLimit-Remaining: 0
RateLimit-Reset: 60
```

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
| API key | Shared secret from server `.env` (`API_KEY`) — **server-side only** |

Typical flow:

1. User requests an audit in Clearweb
2. **Your backend** calls `POST /api/scan` with the target URL
3. **Your backend** polls `GET /api/scan/:jobId` until complete
4. Store `result.score`, `result.violations`, and related fields in your database
5. Expose job status/result to the FE via your own API (without the scanner API key)

### Backend integration (TypeScript)

```typescript
async function runScan(targetUrl: string): Promise<ScanJobResponse> {
  const base = "https://scanner.clearweb.co.il";
  const headers = {
    Authorization: `Bearer ${process.env.SCANNER_API_KEY}`,
    "Content-Type": "application/json",
  };

  const createRes = await fetch(`${base}/api/scan`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: targetUrl,
      options: { includeScreenshot: false },
    }),
  });

  if (!createRes.ok) {
    throw (await createRes.json()) as ErrorResponse;
  }

  const { jobId } = (await createRes.json()) as ScanJobCreatedResponse;

  for (;;) {
    const pollRes = await fetch(`${base}/api/scan/${jobId}`, { headers });
    const job = (await pollRes.json()) as ScanJobResponse;

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}
```

Your FE should call **your** API (e.g. `POST /api/audits`, `GET /api/audits/:id`), not the scanner directly.

Poll every **2–3 seconds**. Most scans finish in **15–45 seconds**.
