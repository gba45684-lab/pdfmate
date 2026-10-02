# PDFMate

Privacy-first browser PDF workspace built with Next.js, TypeScript, Tailwind CSS, PDF.js and pdf-lib.

## Browser-local tools

- Merge PDF
- Split / extract pages
- Delete pages
- Rotate pages
- Reorder pages
- Watermark
- Page numbers
- JPG/PNG to PDF
- PDF to PNG/JPG
- Sign PDF with a drawn signature
- Resize PDF
- Edit PDF with text, highlights, boxes, lines and whiteout
- Fill PDF forms, including text fields and common checkbox/select controls
- OCR scanned PDF pages locally (English or English + Hindi)
- AI PDF text Q&A

PDF-to-image exports are packaged into a ZIP for a single download.

The listed document operations process files in the browser. PDFMate does not upload those files for the local tools.

## AI

The AI route is `/api/ai` and keeps the OpenRouter API key server-side.

Set:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (optional; defaults to `openai/gpt-4o-mini`)
- `NEXT_PUBLIC_APP_URL`

PDF text is extracted in the browser before the selected text is sent to the AI endpoint. The proxy limits request size, message count and output tokens.

## Reserved server pipeline

Compression, password encryption, PDF/A, Office conversion and advanced repair/editing require a real server/worker pipeline. OCR is currently available as a browser-local text recognition tool. PDFMate does not fake these operations in the browser.

## Development

    npm install
    npm run dev

Production checks:

    npm run lint
    npm run build

## Modern workspace additions

- **Auto PDF Mode** inspects page count, orientation, form fields and selectable text locally, then recommends OCR, form filling, optimization or editing.
- Offline-ready PWA shell with a web manifest and service worker.
- Local PDF optimization using object streams and metadata cleanup when beneficial.
- Visual click-to-place PDF annotations.
- ZIP packaging for PDF-to-image exports.
- Local recent-tool history for faster repeat workflows.

These patterns were informed by public open-source PDF projects including ClawPDF, PDF Tools Suite, Paperless PDF and browser PDF editors; PDFMate implements the useful ideas independently rather than copying project code.

### Cloud workspace foundation

- Supabase magic-link authentication
- Row-level-secured document metadata
- Private Supabase Storage upload URL API
- Storage owner policy in `supabase/schema.sql`
- Optional cloud history panel backed by Supabase-authenticated document metadata

Configure the Supabase project and private `documents` bucket before enabling cloud uploads.

### Server worker

The `worker/` directory contains the isolated qpdf/LibreOffice production worker for password encryption, optimization and Office-to-PDF conversion. Deploy separately and keep it private.

### Deployment

PDFMate is a standard Next.js application and should be imported into Vercel as a normal Next.js project, not as a Vercel Services multi-service project.

The GitHub `main` branch is configured for automated CI validation and is intended to be connected to the Vercel production deployment.
