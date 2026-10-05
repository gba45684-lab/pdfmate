# Browser end-to-end suites (Playwright for Python)

**Easiest:** `bash e2e/run_all.sh [all|nav|tools|direct|a11y]` builds the right app variants, starts the app, worker and a static server for the native home, runs the suites and cleans up (exit code is non-zero on any failure). The sections below show what it does by hand.

Setup once: `pip install playwright pillow && playwright install chromium`, plus `qpdf`, `poppler-utils` (pdfinfo, pdftotext) and optionally LibreOffice.

```bash
bash e2e/make_fixtures.sh                         # sample files in /tmp/e2e
npm ci && npm run build
(cd worker && npm ci && NODE_ENV=test PORT=8099 PDF_WORKER_TOKEN=tok node server.mjs &)
PDF_WORKER_URL=http://127.0.0.1:8099 PDF_WORKER_TOKEN=tok NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next start -p 3100 &
(cd mobile && python3 -m http.server 8200 &)

python3 e2e/web_navigation.py   # menus, Back/Escape/focus, deep links, sign-in/privacy round trips
python3 e2e/native_home.py      # native Capacitor home: routes, Back through tool steps, Images to PDF, handoff
python3 e2e/all_tools.py        # all 23 tools with real files; outputs validated; reports CSP violations
python3 e2e/ocr_offline.py      # OCR with every external request blocked
python3 e2e/a11y.py             # axe-core WCAG 2.1 A/AA + best-practice audit of every screen (needs `npm ci` for axe-core); fails on serious/critical

# Routes + cloud UI against mock OpenRouter/Supabase (e2e/mock_services.py). Build AND start with the mock env:
#   export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9100 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon NEXT_PUBLIC_APP_URL=http://localhost:3100
#   npm run build; start with OPENROUTER_API_KEY=k OPENROUTER_MODEL=default-model OPENROUTER_ALLOWED_MODELS=allowed-model OPENROUTER_BASE_URL=http://127.0.0.1:9200
python3 e2e/api_routes.py       # auth, ownership, origin checks, path validation, AI guards, rate limit, AI tool in the browser
python3 e2e/cloud_ui.py         # save -> list -> open -> delete through the UI; signed-out behaviour
# (the mocks emulate the protocols; they do not test Postgres row-level security, which needs a real Supabase project)

# Direct browser->worker uploads need a build that knows the worker origin (it goes into the CSP) and a worker that allows the app origin:
#   PDF_WORKER_PUBLIC_URL=http://127.0.0.1:8099 npm run build   (worker started with ALLOWED_ORIGINS=http://localhost:3100,
#   app started with the same PDF_WORKER_PUBLIC_URL)  then:
python3 e2e/direct_upload.py    # token -> direct POST to worker, 6.5 MB file, protect; no CSP/CORS violations
```
