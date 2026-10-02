# PDFMate worker

Isolated server-side worker for operations that should not run in the browser.

## Operations

Send a multipart POST request with:
- `file` — input document
- `action` — `protect`, `compress`, or `office-to-pdf`
- `password` — required only for `protect` and must be at least 8 characters

### protect
Validates the PDF with qpdf and applies 256-bit PDF encryption.

### compress
Uses qpdf stream/object/image optimization. No password is required.

### office-to-pdf
Uses headless LibreOffice to convert supported Office documents to PDF. No password is required.

Set `PDF_WORKER_TOKEN` and send `Authorization: Bearer <token>`.

## Container

Build and run this worker separately from Vercel. Keep it on a private network and expose only the application proxy.

The worker deletes temporary files after each request and rejects files above `MAX_FILE_BYTES` (default 50 MiB).