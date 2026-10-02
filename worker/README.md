# PDFMate worker

Isolated server-side worker for operations that should not run in the browser.

## Current operation
- `POST /any` multipart fields: `file`, `password`
- qpdf validates and applies 256-bit PDF encryption.
- Set `PDF_WORKER_TOKEN` and send `Authorization: Bearer <token>`.

## Container
Build and run this worker separately from Vercel. Keep it on a private network and expose only the application proxy.

The worker deletes temporary files after each request and rejects files above `MAX_FILE_BYTES` (default 50 MiB).

Future worker operations can use the same isolated boundary for advanced compression and LibreOffice conversion.