#!/usr/bin/env bash
set -euo pipefail

IMAGE="$1"
API_KEY="${API_KEY:-ci-test-key}"
HOST_PORT="${HOST_PORT:-3000}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"

docker rm -f scanner-worker 2>/dev/null || true
docker run -d \
  --name scanner-worker \
  -p "${BIND_HOST}:${HOST_PORT}:3000" \
  -e CI=true \
  -e API_KEY="$API_KEY" \
  "$IMAGE"

cleanup() {
  docker rm -f scanner-worker 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -sf "http://${BIND_HOST}:${HOST_PORT}/api/health/ready" >/dev/null; then
    echo "Readiness check passed"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Readiness check failed"
    docker logs scanner-worker
    exit 1
  fi
  sleep 2
done

JOB=$(curl -sf -X POST "http://${BIND_HOST}:${HOST_PORT}/api/scan" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}')
JOB_ID=$(node -e "console.log(JSON.parse(process.argv[1]).jobId)" "$JOB")
echo "Queued scan job $JOB_ID"

for i in $(seq 1 60); do
  STATUS=$(curl -sf -H "Authorization: Bearer $API_KEY" \
    "http://${BIND_HOST}:${HOST_PORT}/api/scan/$JOB_ID")
  if echo "$STATUS" | grep -q '"status":"completed"'; then
    echo "Scan smoke test passed"
    exit 0
  fi
  if echo "$STATUS" | grep -q '"status":"failed"'; then
    echo "Scan failed: $STATUS"
    docker logs scanner-worker
    exit 1
  fi
  sleep 2
done

echo "Scan smoke test timed out"
docker logs scanner-worker
exit 1
