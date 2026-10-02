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

Compression, password encryption, OCR, PDF/A, Office conversion and advanced repair/editing require a real server/worker pipeline. PDFMate does not fake these operations in the browser.

## Development

    npm install
    npm run dev

Production checks:

    npm run lint
    npm run build
