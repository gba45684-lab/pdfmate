# PDFMate

Privacy-first PDF workspace: 23 tools, mostly processed in the browser. Next.js 16 (App Router), Supabase (optional accounts and private cloud files), an isolated worker for server-side operations, and a Capacitor Android shell.

## Quick start

```bash
nvm use            # Node 22
npm ci
cp .env.example .env.local
npm run dev
npm run verify     # typecheck + lint + tests + production build
```

## Architecture

| Part | Where | Notes |
| --- | --- | --- |
| Web app | `app/`, `lib/` | Browser-side tools use pdf-lib, pdf.js and tesseract.js. Tailwind v4 via `@tailwindcss/postcss`. |
| API routes | `app/api/*` | Same-origin only, rate-limited, size-capped. Cloud routes require a Supabase session. |
| Worker | `worker/` | Protect, optimize (qpdf) and Office to PDF (LibreOffice). Docker image; bearer-token auth; non-root, read-only filesystem. |
| Database | `supabase/schema.sql` | Idempotent. Row-level security, private bucket, 50 MiB / PDF-only limits. |
| Android | `mobile/index.html`, `mobile/android-res/` (launcher icons) + `.github/workflows/android-apk.yml` | Native home screen; tools open in the hosted app via `/?tool=<id>`. |

## Deploy

A step-by-step checklist with verification points lives in [`docs/launch-checklist.md`](docs/launch-checklist.md).

1. **Supabase**: create a project, run `supabase/schema.sql`, enable Email auth, and add `https://<your-domain>/auth/callback` to the redirect allow-list.
2. **Worker**: build `worker/` (or use the GHCR image from the *Worker Image* workflow) and run it on a private host. Set `PDF_WORKER_TOKEN`; the worker refuses to start in production without it. `docker compose` in `worker/` applies hardened defaults.
   **Direct upload (recommended for files over ~4 MB):** expose the worker over HTTPS, set `ALLOWED_ORIGINS=https://<your-domain>` on the worker and `PDF_WORKER_PUBLIC_URL=https://<worker-host>` on the web app. The browser then gets a 2-minute, single-use, action-bound upload token from `/api/pdf/token` and uploads straight to the worker; the worker secret never reaches the browser. Without `PDF_WORKER_PUBLIC_URL` the app uses the same-origin proxy.
3. **Web app (Vercel or any Node host)**: set the variables from `.env.example`. Health check: `GET /api/health`.
4. **Android**: run the *PDFMate Android* workflow. Set repo variable `PDFMATE_WORKSPACE_HOST` if your domain differs from the default. Add the four secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` to also get a signed release APK and AAB.

## Security model

- Browser tools never upload files. Server-assisted tools (protect, optimize, Office to PDF) send the chosen file through `/api/pdf/*` to the worker. AI PDF sends the text you ask about to OpenRouter.
- All state-changing API routes reject cross-origin requests. The AI model is fixed server-side unless listed in `OPENROUTER_ALLOWED_MODELS`.
- Browser upload tokens are HMAC-signed, expire in 2 minutes, work for one action and one use; CORS is limited to `ALLOWED_ORIGINS`.
- A privacy notice is served at `/privacy`; set `NEXT_PUBLIC_CONTACT_EMAIL` **before building** to show a contact address. Have it reviewed against your own legal requirements.
- The service worker never caches `/api/*` or `/auth*`.
- Passwords for *Protect PDF* set both the user and owner password (the file cannot be opened without it) and reach qpdf through a private args file, never the process list or logs.
- Security headers include HSTS and a full production CSP. Every runtime asset is self-hosted (pdf.js worker in `/pdfjs`, OCR engine and English/Hindi data in `/ocr`, both generated from `node_modules` by `scripts/copy-ocr-assets.mjs` before `dev`/`build`), so no third-party script, worker or data host is allowed. `connect-src` adds only your Supabase and `PDF_WORKER_PUBLIC_URL` origins, read at build time.

## Browser end-to-end tests

`e2e/` holds Playwright (Python) suites that drive real Chromium: every menu and Back-button path in the web app and the native home, all 23 tools with real files (outputs are validated with `qpdf`/`pdfinfo`), OCR with all external network blocked, direct worker uploads, an axe-core accessibility audit of every screen, and the API routes and cloud-file UI against mock Supabase/OpenRouter servers. See `e2e/README.md`. Run them all with `bash e2e/run_all.sh` (or `nav`, `tools`, `direct`); the **E2E** workflow does this on every pull request.

## Known limitations

- **Large files on Vercel**: serverless functions accept only ~4.5 MB bodies, so through the `/api/pdf/*` proxy protect / optimize / Office conversion work only for small files. Enable **direct upload** (below) to lift this to the worker limit (50 MiB by default).
- **Rate limiting** is shared across instances when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set (falls back to a per-instance limiter if unset or unreachable). Without them, limits apply per server instance only.
- **Android "Open" for cloud files** uses `window.open`, which a Capacitor WebView may block; test it on a device and add a native browser/share plugin if needed.
- **Android downloads**: the native home generates one tool (Images to PDF) locally; other tools run in the hosted app inside the WebView. Native file-save may need the Capacitor Filesystem/Share plugins.
