import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

export type PdfAction =
  | "merge"
  | "extract"
  | "delete"
  | "rotate"
  | "reorder"
  | "watermark"
  | "pagenumbers"
  | "images";

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
