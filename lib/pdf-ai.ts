export async function extractPdfText(file: File, maxPages = 20, maxChars = 50000) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, disableWorker: true } as any).promise;
  const pages = Math.min(pdf.numPages, maxPages);
  let text = "";
  for (let i = 1; i <= pages && text.length < maxChars; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((item) => ("str" in item ? item.str : "") || "").join(" ");
    text += "\n\n--- Page " + i + " ---\n" + line;
  }
  return text.slice(0, maxChars);
}
