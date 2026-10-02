export type PdfPagePreview = { index: number; url: string; width: number; height: number };

export async function renderPdfPreviews(file: File, maxPages = 30, scale = 0.55): Promise<PdfPagePreview[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, disableWorker: true } as any).promise;
  const previews: PdfPagePreview[] = [];
  const count = Math.min(pdf.numPages, maxPages);

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create a rendering canvas.");
    await page.render({ canvasContext: context, viewport, canvas } as any).promise;
    previews.push({ index: i, url: canvas.toDataURL("image/jpeg", 0.78), width: canvas.width, height: canvas.height });
  }

  return previews;
}

export async function pdfToImages(file: File, format: "png" | "jpeg" = "png", scale = 1.5) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, disableWorker: true } as any).promise;
  const images: { name: string; blob: Blob }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create a rendering canvas.");
    await page.render({ canvasContext: context, viewport, canvas } as any).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not encode rendered page.")),
        format === "png" ? "image/png" : "image/jpeg",
        0.92
      );
    });
    images.push({
      name: `pdfmate-page-${String(i).padStart(3, "0")}.${format === "png" ? "png" : "jpg"}`,
      blob
    });
  }

  return images;
}
