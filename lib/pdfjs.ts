/**
 * Opens a PDF with pdf.js using the self-hosted worker (copied to /public/pdfjs by scripts/copy-ocr-assets.mjs).
 * pdf.js takes ownership of the buffer it receives, so it gets a copy and callers can keep using their bytes.
 */
export async function openPdfjsDocument(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}
