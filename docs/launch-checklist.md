# Launch checklist

Work top to bottom. Each step says how to confirm it worked.

## 1. Repository and CI
- [ ] Push to GitHub. **CI**, **E2E** and **CodeQL** should go green (E2E runs every browser suite via `e2e/run_all.sh`).
- [ ] Enable branch protection on `main`: require the `verify` and `browser` jobs.
- [ ] Dependabot PRs appear within a week (`.github/dependabot.yml`).

## 2. Supabase (accounts + private cloud files)
- [ ] Create a project. SQL editor: run `supabase/schema.sql` (safe to re-run).
- [ ] Authentication → URL configuration: Site URL = your domain; add `https://<domain>/auth/callback` to Redirect URLs.
- [ ] Authentication → Providers: Email enabled; set up a real SMTP sender before launch (the built-in one is heavily rate limited).
- [ ] Verify: sign in with an email link, save a PDF from any tool, see it under *My documents*, Open it, Delete it. Then check in Storage that the object is gone.
- [ ] Verify row-level security with two accounts: account B must not see or open account A's files (the e2e suite only emulates the API, it cannot test RLS).

## 3. PDF worker (protect / optimize / Office to PDF)
- [ ] Generate a long random token: `openssl rand -hex 32`.
- [ ] Run the image from the **Worker Image** workflow (`ghcr.io/<owner>/pdfmate-worker`) or `docker compose up -d` in `worker/` with `PDF_WORKER_TOKEN`. Put it behind HTTPS.
- [ ] For direct (large-file) uploads also set `ALLOWED_ORIGINS=https://<domain>` on the worker.
- [ ] Verify: `curl https://<worker>/healthz` returns `{"ok":true}`. A request without the token returns 401.
- [ ] Verify an Office document converts (this is the first real test of the LibreOffice container; it could not be built in the sandbox).

## 4. Web app (Vercel or any Node host)
Set the variables from `.env.example`. **Rebuild after changing any `NEXT_PUBLIC_*` value or `PDF_WORKER_PUBLIC_URL`** (they are baked into the bundle and the CSP).
- [ ] `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET`
- [ ] `PDF_WORKER_URL`, `PDF_WORKER_TOKEN` (+ `PDF_WORKER_PUBLIC_URL` for direct uploads)
- [ ] `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`, `OPENROUTER_ALLOWED_MODELS`)
- [ ] Optional: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` for shared rate limiting; `NEXT_PUBLIC_CONTACT_EMAIL` for the privacy page
- [ ] Verify: `/api/health` returns ok; open a tool, process a file; `/privacy` loads; response headers include `Strict-Transport-Security` and `Content-Security-Policy`.
- [ ] Review `/privacy` with whoever is responsible for your legal requirements.

## 5. Android
- [ ] Repo variable `PDFMATE_WORKSPACE_HOST` = your domain (no scheme). Run the **PDFMate Android** workflow; download the debug APK artifact.
- [ ] On a real phone, in this order: intro screens; Images to PDF with 2–3 photos then Download; a hosted tool opening directly; Android Back from inside a tool (should return to the home screen); cloud *Open* (uses `window.open`, may need a native plugin).
- [ ] For a store release: create a keystore, base64 it, add the secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; the workflow then also uploads a signed APK + AAB. Keep the keystore backed up: losing it means you cannot update the app.

## 6. After launch
- [ ] Watch worker logs for 422/500 rates; the worker never logs passwords or file names.
- [ ] Rotate `PDF_WORKER_TOKEN` and `OPENROUTER_API_KEY` on a schedule (update web app and worker together).
