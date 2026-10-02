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
- OCR scanned PDF pages locally (English or English + Hindi) (English or English + Hindi)

PDF-to-image exports are packaged into a ZIP for a single download.
- AI PDF text Q&A

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

These patterns were informed by public open-source PDF projects including ClawPDF, PDF Tools Suite, Paperless PDF and browser PDF editors; PDFMate implements the useful ideas independently rather than copying project code.
