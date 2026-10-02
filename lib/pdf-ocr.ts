export type OcrPage = { page: number; text: string };

export async function ocrPdf(file: File, maxPages = 20, onProgress?: (value: number) => void): Promise<OcrPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createWorker } = await import("tesseract.js");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const worker = await createWorker("eng");
  const results: OcrPage[] = [];

  try {
    for (let i = 1; i <= count; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not create an OCR canvas.");
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas);
      results.push({ page: i, text: result.data.text.trim() });
      onProgress?.(i / count);
    }
  } finally {
    await worker.terminate();
  }
  return results;
}
