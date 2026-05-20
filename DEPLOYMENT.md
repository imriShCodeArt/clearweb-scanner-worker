# Production deployment

This guide covers GitHub setup and VPS deployment for **clearweb-scanner-worker**.

## Architecture

```text
Client ──HTTPS──► nginx/Caddy ──HTTP──► Docker (scanner-worker:3000)
                                              │
                                              ├── Chromium (Playwright)
                                              └── Prometheus scrape (optional, localhost)
```

The worker binds to `127.0.0.1:3000` by default. Put TLS and public routing on a reverse proxy; do not expose port 3000 to the internet directly.

---

## 1. GitHub repository setup

### Enable GitHub Actions

1. Open **Settings → Actions → General**.
2. Set **Workflow permissions** to **Read and write permissions** (needed for GHCR publish via `GITHUB_TOKEN`).
3. Save.

### Make the container image available

After the first successful run of **Publish container image**, the image appears at:

`ghcr.io/imrishcodeart/clearweb-scanner-worker:latest`

**Option A — Public package (simplest for a single VPS):**

1. Go to **Packages** on your profile/org → `clearweb-scanner-worker`.
2. **Package settings → Change visibility → Public**.

**Option B — Private package (pull with a token on the VPS):**

1. Create a fine-grained PAT with **read:packages**.
2. On the VPS: `echo "YOUR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin`

### Branch protection (recommended)

**Settings → Branches → Add rule** for `main`:

- Require pull request before merging
- Require status checks: **lint-and-test**, **docker** (from CI)
- Require branches to be up to date

### Dependabot

`.github/dependabot.yml` opens weekly PRs for npm and GitHub Actions updates. Review and merge after CI passes.

### Automatic deploy to VPS

The **Deploy to VPS** workflow runs after a successful publish (or manually via **Actions → Deploy to VPS → Run workflow**).

Create a GitHub **Environment** named `production` (**Settings → Environments → New environment**), then add these **environment secrets**:

| Secret | Example | Purpose |
|--------|---------|---------|
| `VPS_HOST` | `203.0.113.10` | Server IP or hostname |
| `VPS_USER` | `deploy` | SSH user |
| `VPS_SSH_KEY` | *(private key)* | PEM key for GitHub Actions SSH |
| `VPS_DEPLOY_DIR` | `/home/deploy/clearweb-scanner-worker` | Directory with `.env` on the server |

The deploy workflow uses `environment: production` so these secrets are loaded automatically.

The deploy user needs permission to run `docker compose` (add to `docker` group). Each deploy writes the latest `docker-compose.prod.yml` from the repository to the VPS over SSH.

#### SSH key for `VPS_SSH_KEY`

Generate a dedicated deploy key (on your machine):

```bash
ssh-keygen -t ed25519 -f github-actions-deploy -N ""
cat github-actions-deploy.pub >> /home/deploy/.ssh/authorized_keys
```

Copy the **entire private key** into the `VPS_SSH_KEY` secret, including the header/footer:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

Do not wrap the key in quotes. If deploy logs show `ssh: no key found`, the secret is malformed.

Ensure port **22** is reachable from the internet (`sudo ufw allow OpenSSH`). GitHub-hosted runners connect from dynamic IPs, so the VPS must accept SSH on port 22 (standard for CI deploy).

Test from your machine:

```bash
ssh -i github-actions-deploy deploy@YOUR_VPS_IP
```

---

## 2. VPS preparation

### System requirements

- Ubuntu 22.04+ (or similar Linux)
- 4 GB RAM minimum (Chromium is memory-heavy)
- 2 vCPU recommended
- Docker Engine 24+ and Docker Compose v2

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# log out and back in
docker compose version
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** open port 3000 publicly. The app listens on localhost only via `BIND_HOST=127.0.0.1`.

### Create deploy directory

```bash
sudo mkdir -p /home/deploy/clearweb-scanner-worker
sudo chown deploy:deploy /home/deploy/clearweb-scanner-worker
cd /home/deploy/clearweb-scanner-worker
```

Create `.env` on the server (the workflow copies `docker-compose.prod.yml` automatically on each deploy):

If the GHCR package is private, log in first (see above).

---

## 3. Environment file (`.env`)

Generate secrets:

```bash
openssl rand -hex 32   # use for API_KEY
openssl rand -hex 32   # use for METRICS_API_KEY (optional but recommended)
```

Example production `.env`:

```env
API_KEY=<64-char-hex-from-openssl>
METRICS_API_KEY=<another-64-char-hex>
LOG_LEVEL=info
TRUST_PROXY=1
BIND_HOST=127.0.0.1
HOST_PORT=3000
SENTRY_DSN=https://...@sentry.io/...
IMAGE_TAG=latest
```

| Variable | Production notes |
|----------|------------------|
| `API_KEY` | **Required**, min 32 characters |
| `HOST_PORT` | Host port on `127.0.0.1` (default `3000`; container always uses `3000` internally) |
| `METRICS_API_KEY` | Protects `/api/metrics` when set |
| `TRUST_PROXY` | Set `1` behind nginx/Caddy |
| `BIND_HOST` | Keep `127.0.0.1` |
| `MAX_CONCURRENT_SCANS` | Tune to RAM (default `2`) |
| `SENTRY_DSN` | Optional error tracking |

---

## 4. Start the worker

### Pull from GHCR (production)

```bash
cd /home/deploy/clearweb-scanner-worker
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl -sf http://127.0.0.1:3000/api/health/ready
```

### Build on server (alternative)

```bash
git clone https://github.com/imriShCodeArt/clearweb-scanner-worker.git .
cp .env.example .env   # edit API_KEY
docker compose up -d --build
```

### Verify scan API

```bash
export API_KEY="your-key"
JOB=$(curl -s -X POST http://127.0.0.1:3000/api/scan \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}')
echo "$JOB"
# Poll: curl -H "Authorization: Bearer $API_KEY" http://127.0.0.1:3000/api/scan/<jobId>
```

---

## 5. Reverse proxy (nginx)

See [deploy/nginx.example.conf](./deploy/nginx.example.conf).

Highlights:

- Terminate TLS with Let's Encrypt (`certbot`).
- Proxy only `/api/scan` (and optionally job polling) to `127.0.0.1:3000`.
- Do not expose `/api/metrics` publicly; scrape from localhost or an internal network.

```bash
sudo certbot --nginx -d scanner.clearweb.co.il
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Monitoring

### Health checks

| Endpoint | Use |
|----------|-----|
| `GET /api/health/live` | Process alive |
| `GET /api/health/ready` | Chromium ready (Docker healthcheck uses this) |

### Prometheus

Scrape `http://127.0.0.1:3000/api/metrics` from the host or a sidecar. If `METRICS_API_KEY` is set, pass `Authorization: Bearer <key>`.

Key metrics: `scanner_scans_total`, `scanner_scans_failed_total`, `scanner_scans_queued`, `scanner_scan_duration_seconds`.

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100
```

Compose rotates logs at 10 MB × 3 files.

---

## 7. Updates and rollback

### Manual update

```bash
cd /home/deploy/clearweb-scanner-worker
export IMAGE_TAG=latest   # or a git SHA tag from GHCR
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Rollback

```bash
export IMAGE_TAG=<previous-sha-or-version>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Graceful shutdown waits up to `SHUTDOWN_DRAIN_MS` (default 30s) for in-flight scans before exit.

---

## 8. Security checklist

- [ ] `API_KEY` is at least 32 random characters
- [ ] `.env` is not in git and has mode `600`
- [ ] Port 3000 is bound to `127.0.0.1` only
- [ ] TLS on the reverse proxy
- [ ] `METRICS_API_KEY` set if metrics endpoint is reachable beyond localhost
- [ ] UFW allows only 22, 80, 443
- [ ] Sentry configured for production error visibility
- [ ] GHCR package visibility matches your threat model (public vs private + PAT)

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Container exits immediately | Short `API_KEY` in production | Use 32+ char secret |
| Readiness 503 | Chromium failed to start | Check RAM (`mem_limit`), `docker logs` |
| 502 from nginx | Worker not running | `docker compose ps`, check health |
| Scans timeout | Slow target or low timeout | Raise `SCAN_TIMEOUT_MS` |
| Rate limit 429 | Too many requests | Raise `RATE_LIMIT_*` or backoff clients |

```bash
docker compose -f docker-compose.prod.yml logs scanner-worker
docker stats
curl -v http://127.0.0.1:3000/api/health/ready
```
