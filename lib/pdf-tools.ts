import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

export type PdfAction =
  | "merge"
  | "extract"
  | "delete"
  | "rotate"
  | "reorder"
  | "watermark"
  | "pagenumbers"
  | "images"
  | "resize";

export async function loadPdf(file: File) {
  return PDFDocument.load(await file.arrayBuffer());
}

export async function mergePdfs(files: File[]) {
  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await loadPdf(file);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((page) => out.addPage(page));
  }
  return out.save();
}

function parsePages(value: string, total: number) {
  const pages = new Set<number>();
  for (const part of value.split(",")) {
    const item = part.trim();
    if (!item) continue;
    const range = item.split("-").map((n) => Number(n.trim()));
    if (range.length === 1 && Number.isInteger(range[0]) && range[0] >= 1 && range[0] <= total) pages.add(range[0] - 1);
    if (range.length === 2 && Number.isInteger(range[0]) && Number.isInteger(range[1])) {
      const start = Math.max(1, Math.min(range[0], range[1]));
      const end = Math.min(total, Math.max(range[0], range[1]));
      for (let i = start; i <= end; i++) pages.add(i - 1);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export async function extractPages(file: File, pageSpec: string) {
  const src = await loadPdf(file);
  const indexes = parsePages(pageSpec, src.getPageCount());
  if (!indexes.length) throw new Error("Enter at least one valid page.");
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indexes);
  pages.forEach((page) => out.addPage(page));
  return out.save();
}

export async function deletePages(file: File, pageSpec: string) {
  const src = await loadPdf(file);
  const remove = new Set(parsePages(pageSpec, src.getPageCount()));
  if (!remove.size) throw new Error("Enter at least one valid page.");
  const out = await PDFDocument.create();
  const keep = src.getPageIndices().filter((i) => !remove.has(i));
  if (!keep.length) throw new Error("You cannot delete every page.");
  const pages = await out.copyPages(src, keep);
  pages.forEach((page) => out.addPage(page));
  return out.save();
}

export async function rotatePages(file: File, pageSpec: string, angle: number) {
  const src = await loadPdf(file);
  const targets = new Set(parsePages(pageSpec || "1-" + src.getPageCount(), src.getPageCount()));
  src.getPages().forEach((page, index) => {
    if (targets.has(index)) page.setRotation(degrees((page.getRotation().angle + angle + 360) % 360));
  });
  return src.save();
}

export async function reorderPages(file: File, orderSpec: string) {
  const src = await loadPdf(file);
  const order = parsePages(orderSpec, src.getPageCount());
  if (order.length !== src.getPageCount()) throw new Error("Enter every page exactly once, for example 3,1,2.");
  if (new Set(order).size !== src.getPageCount()) throw new Error("Each page must appear once.");
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((page) => out.addPage(page));
  return out.save();
}

export async function addWatermark(file: File, text: string) {
  const src = await loadPdf(file);
  const font = await src.embedFont(StandardFonts.HelveticaBold);
  src.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width * 0.2,
      y: height * 0.5,
      size: Math.max(18, Math.min(width, height) / 16),
      font,
      color: rgb(0.45, 0.3, 0.9),
      opacity: 0.25,
      rotate: degrees(35),
    });
  });
  return src.save();
}

export async function addPageNumbers(file: File) {
  const src = await loadPdf(file);
  const font = await src.embedFont(StandardFonts.Helvetica);
  const total = src.getPageCount();
  src.getPages().forEach((page, index) => {
    const { width } = page.getSize();
    const label = String(index + 1) + " / " + total;
    page.drawText(label, { x: width - 70, y: 18, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
  });
  return src.save();
}

export async function imagesToPdf(files: File[]) {
  const out = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const image = file.type === "image/png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const page = out.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  return out.save();
}


export type PdfPageSize = "a4" | "letter" | "legal" | "a5";

const PAGE_SIZES: Record<PdfPageSize, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a5: [419.53, 595.28],
};

export async function resizePdf(file: File, size: PdfPageSize) {
  const src = await loadPdf(file);
  const out = await PDFDocument.create();
  const [targetWidth, targetHeight] = PAGE_SIZES[size];
  for (const sourcePage of src.getPages()) {
    const embedded = await out.embedPage(sourcePage);
    const sourceWidth = Math.max(1, sourcePage.getWidth());
    const sourceHeight = Math.max(1, sourcePage.getHeight());
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const page = out.addPage([targetWidth, targetHeight]);
    page.drawPage(embedded, { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height });
  }
  return out.save();
}

export async function getPdfPageCount(file: File) {
  const src = await loadPdf(file);
  return src.getPageCount();
}

export async function cropPages(file: File, margin = 24) {
  const src = await loadPdf(file);
  src.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const safe = Math.min(Math.max(margin, 0), Math.min(width, height) / 3);
    page.setCropBox(safe, safe, Math.max(1, width - safe * 2), Math.max(1, height - safe * 2));
  });
  return src.save();
}

export async function flattenPdf(file: File) {
  const src = await loadPdf(file);
  const form = src.getForm();
  if (form.getFields().length) form.flatten();
  return src.save();
}

export async function addSignature(file: File, signatureDataUrl: string, pageSpec = "") {
  const src = await loadPdf(file);
  const targets = parsePages(pageSpec || "1-" + src.getPageCount(), src.getPageCount());
  if (!targets.length) throw new Error("Select at least one page for the signature.");

  const base64 = signatureDataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid signature image.");
  const signatureBytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const image = await src.embedPng(signatureBytes);

  targets.forEach((index) => {
    const page = src.getPage(index);
    const { width, height } = page.getSize();
    const maxWidth = Math.min(180, width * 0.32);
    const ratio = image.height / image.width;
    const drawWidth = maxWidth;
    const drawHeight = drawWidth * ratio;
    page.drawImage(image, {
      x: Math.max(24, width - drawWidth - 36),
      y: 36,
      width: drawWidth,
      height: drawHeight,
      opacity: 0.92,
    });
  });

  return src.save();
}

export async function fillPdfForm(file: File, values: Record<string, string>) {
  const src = await loadPdf(file);
  const form = src.getForm();
  const fields = form.getFields();
  if (!fields.length) throw new Error("This PDF does not contain fillable form fields.");

  for (const field of fields) {
    const name = field.getName();
    const value = values[name];
    if (typeof value !== "string") continue;
    if (typeof (field as { setText?: (value: string) => void }).setText === "function") {
      (field as { setText: (value: string) => void }).setText(value);
    }
  }
  return src.save();
}

export async function getPdfFormFields(file: File) {
  const src = await loadPdf(file);
  return src.getForm().getFields().map((field) => ({
    name: field.getName(),
    type: field.constructor.name,
  }));
}

export type PdfAnnotation =
  | { type: "text"; page: number; x: number; y: number; text: string; size?: number }
  | { type: "highlight"; page: number; x: number; y: number; width: number; height: number }
  | { type: "rect"; page: number; x: number; y: number; width: number; height: number }
  | { type: "line"; page: number; x1: number; y1: number; x2: number; y2: number };

export async function annotatePdf(file: File, annotations: PdfAnnotation[]) {
  const src = await loadPdf(file);
  const font = await src.embedFont(StandardFonts.Helvetica);
  for (const item of annotations) {
    const page = src.getPage(item.page);
    if (!page) continue;
    if (item.type === "text") {
      page.drawText(item.text, { x: item.x, y: item.y, size: Math.max(6, Math.min(48, item.size || 16)), font, color: rgb(0.08, 0.08, 0.12) });
    } else if (item.type === "highlight") {
      page.drawRectangle({ x: item.x, y: item.y, width: item.width, height: item.height, color: rgb(1, 0.88, 0.2), opacity: 0.28, borderWidth: 0 });
    } else if (item.type === "rect") {
      page.drawRectangle({ x: item.x, y: item.y, width: item.width, height: item.height, borderColor: rgb(0.25, 0.2, 0.75), borderWidth: 2 });
    } else {
      page.drawLine({ start: { x: item.x1, y: item.y1 }, end: { x: item.x2, y: item.y2 }, color: rgb(0.08, 0.08, 0.12), thickness: 2 });
    }
  }
  return src.save();
}

export async function rotateAllPages(file: File, angle: number) {
  return rotatePages(file, "", angle);
}
