#!/usr/bin/env bash
# Runs every browser suite against freshly built apps. Usage: e2e/run_all.sh [all|nav|tools|direct|a11y]
# Needs: node 22, python3 + playwright + Pillow (+ chromium), qpdf, poppler-utils, LibreOffice (soffice), npm ci in . and worker/.
set -uo pipefail
cd "$(dirname "$0")/.."
PHASE="${1:-all}"; FAILED=(); PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill -TERM -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
# Each service gets its own process group (setsid) so npx/node children die with it and never keep a port.
spawn() { local dir="$1"; shift; setsid bash -c 'cd "$0" && exec env "$@"' "$dir" "$@" >"/tmp/e2e-$$-${#PIDS[@]}.log" 2>&1 & PIDS+=($!); }
port_free() { if curl -s -m 2 -o /dev/null "$1"; then echo "port in use: $1 (stop the other process first)"; exit 1; fi; }
wait_http() { for _ in $(seq 1 60); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done; echo "timeout waiting for $1"; return 1; }
stop_all() { cleanup; PIDS=(); sleep 2; }
suite() { local name="$1"; shift; echo "=== $name"; "$@" >/tmp/e2e-suite.log 2>&1; local rc=$?; grep -E "^FAIL|passed|RESULT|violations|Traceback" /tmp/e2e-suite.log || true; if [ $rc -ne 0 ]; then FAILED+=("$name"); echo "--- last lines of the failing suite log ($name):"; tail -25 /tmp/e2e-suite.log; echo "---"; fi; }
bash e2e/make_fixtures.sh >/dev/null
APP=http://localhost:3100
port_free $APP/api/health; port_free http://127.0.0.1:8099/healthz; port_free http://localhost:8200/
if [ "$PHASE" = all ] || [ "$PHASE" = nav ] || [ "$PHASE" = tools ]; then
  # Build A: mock Supabase origin baked into the CSP and client bundle
  NEXT_PUBLIC_APP_URL=$APP NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9100 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run build >/tmp/e2e-build-a.log 2>&1 || { echo "build A failed"; tail -20 /tmp/e2e-build-a.log; exit 1; }
  spawn mobile python3 -m http.server 8200
  spawn worker NODE_ENV=test PORT=8099 PDF_WORKER_TOKEN=tok node server.mjs
  spawn . NEXT_PUBLIC_APP_URL=$APP NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9100 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon PDF_WORKER_URL=http://127.0.0.1:8099 PDF_WORKER_TOKEN=tok OPENROUTER_API_KEY=k OPENROUTER_MODEL=default-model OPENROUTER_ALLOWED_MODELS=allowed-model OPENROUTER_BASE_URL=http://127.0.0.1:9200 npx next start -p 3100
  wait_http $APP/api/health && wait_http http://localhost:8200/index.html && wait_http http://127.0.0.1:8099/healthz || exit 1
  if [ "$PHASE" = all ] || [ "$PHASE" = nav ]; then
    suite "web navigation / back / dialog" python3 e2e/web_navigation.py
    suite "native home" python3 e2e/native_home.py
    suite "API routes + AI" python3 e2e/api_routes.py
    suite "cloud documents UI" python3 e2e/cloud_ui.py
  fi
  if [ "$PHASE" = all ] || [ "$PHASE" = tools ]; then
    suite "all 23 tools" python3 e2e/all_tools.py
    suite "OCR, external network blocked" python3 e2e/ocr_offline.py
  fi
  stop_all
fi
if [ "$PHASE" = all ] || [ "$PHASE" = direct ]; then
  # Build B: worker public origin baked into the CSP so the browser may upload to it directly
  NEXT_PUBLIC_APP_URL=$APP PDF_WORKER_PUBLIC_URL=http://127.0.0.1:8099 npm run build >/tmp/e2e-build-b.log 2>&1 || { echo "build B failed"; tail -20 /tmp/e2e-build-b.log; exit 1; }
  spawn worker NODE_ENV=test PORT=8099 PDF_WORKER_TOKEN=tok ALLOWED_ORIGINS=$APP node server.mjs
  spawn . NEXT_PUBLIC_APP_URL=$APP PDF_WORKER_URL=http://127.0.0.1:8099 PDF_WORKER_PUBLIC_URL=http://127.0.0.1:8099 PDF_WORKER_TOKEN=tok npx next start -p 3100
  wait_http $APP/api/health && wait_http http://127.0.0.1:8099/healthz || exit 1
  suite "direct browser -> worker upload" python3 e2e/direct_upload.py
  stop_all
fi
if [ "$PHASE" = all ] || [ "$PHASE" = a11y ]; then
  # Default build (no mock env): accessibility audit of every screen in both apps
  NEXT_PUBLIC_APP_URL=$APP npm run build >/tmp/e2e-build-c.log 2>&1 || { echo "build C failed"; tail -20 /tmp/e2e-build-c.log; exit 1; }
  spawn mobile python3 -m http.server 8200
  spawn . NEXT_PUBLIC_APP_URL=$APP npx next start -p 3100
  wait_http $APP/api/health && wait_http http://localhost:8200/index.html || exit 1
  suite "accessibility (axe-core, WCAG 2.1 AA)" python3 e2e/a11y.py
  stop_all
fi
echo; if [ ${#FAILED[@]} -eq 0 ]; then echo "ALL E2E SUITES PASSED"; else echo "FAILED: ${FAILED[*]}"; exit 1; fi
