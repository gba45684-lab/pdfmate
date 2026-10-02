# PDFMate production pipeline

## Browser-first
Merge, split, reorder, annotations, redaction overlays, forms, OCR and searchable OCR run locally when supported.

## Server pipeline contracts still required
- **True password encryption:** use a qpdf/Ghostscript-compatible worker or a trusted PDF service; pdf-lib alone does not provide PDF password encryption.
- **Advanced compression:** run qpdf/Ghostscript in an isolated worker for image recompression, object cleanup and linearization.
- **Office conversion:** use a sandboxed LibreOffice worker or a conversion API. Do not fake DOCX/XLSX/PPTX conversion in the browser.
- **Secure redaction:** current redaction draws an opaque black region into a new PDF. A legal-grade redaction pipeline must remove underlying content/resources and verify the result.
- **Rate limiting:** the AI route now has a basic per-process guard; production should move this to a shared store such as Upstash/Redis or an equivalent edge rate limiter.
- **Cloud history:** Supabase auth + RLS document metadata are now scaffolded. Storage upload/download policies should be enabled only after the Storage bucket and retention policy are configured.

## Isolated worker

The `worker/` container provides qpdf-backed 256-bit PDF encryption, qpdf optimization and LibreOffice Office-to-PDF conversion. Deploy it separately from Vercel on a private network, set `PDF_WORKER_TOKEN`, and point `PDF_WORKER_URL` at the private worker through an authenticated proxy. The container uses a read-only filesystem, a temporary filesystem and drops Linux capabilities.

Secure redaction still requires content removal and verification; the browser overlay is not legal-grade redaction.

## Required production secrets
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
OPENROUTER_API_KEY
