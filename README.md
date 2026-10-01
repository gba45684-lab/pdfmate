# PDFMate

Privacy-first browser PDF workspace built with Next.js, TypeScript, Tailwind CSS and pdf-lib.

## Local-first tools

- Merge PDF
- Split / extract pages
- Delete pages
- Rotate pages
- Reorder pages
- Watermark
- Page numbers
- JPG/PNG to PDF
- AI PDF text Q&A

Core document operations run in the browser. Files are not uploaded for those operations.

## Server features

The AI route is /api/ai and keeps the OpenRouter key server-side.

Set OPENROUTER_API_KEY and NEXT_PUBLIC_APP_URL in the deployment environment.

Compression, password encryption, OCR and advanced PDF/image conversion are reserved for the secure server processing pipeline.

## Development

    npm install
    npm run dev

Production check:

    npm run lint
    npm run build
