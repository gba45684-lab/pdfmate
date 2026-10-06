# Production pipeline

1. Pull request → **CI** (`.github/workflows/ci.yml`): `npm ci`, worker `npm ci`, typecheck, lint, tests (including real qpdf worker tests), production build, `npm audit` (high).
2. Merge to `main` → Vercel deploys the web app; **Worker Image** publishes `ghcr.io/<owner>/pdfmate-worker:{latest,<sha>}` when `worker/**` changes.
3. Roll the worker by pulling the new tag; keep `PDF_WORKER_TOKEN` in sync with the web app.
4. **Android** workflow builds a debug APK on every `mobile/**` change and a signed APK/AAB when signing secrets are configured.
5. Dependabot opens weekly PRs for app, worker, Docker and Actions dependencies. CodeQL runs on its own schedule.

Rollback: redeploy the previous Vercel deployment; re-run the worker with the previous image SHA.
