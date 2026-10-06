import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { openPdfjsDocument } from "./pdfjs";

export type OcrPage = { page: number; text: string };

// Self-hosted engine, core and language data (copied to public/ocr by scripts/copy-ocr-assets.mjs): no third-party CDN.
const OCR_ASSETS = { workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang", gzip: true, workerBlobURL: false };

export async function ocrPdf(file: File, maxPages = 20, onProgress?: (value: number) => void, language = "eng"): Promise<OcrPage[]> {
  const { createWorker } = await import("tesseract.js");
  const data = new Uint8Array(await file.arrayBuffer()); const pdf = await openPdfjsDocument(data);
  const count = Math.min(pdf.numPages, maxPages); const worker = await createWorker(language, 1, OCR_ASSETS); const results: OcrPage[] = [];
  try { for (let i=1;i<=count;i++){ const page=await pdf.getPage(i); const viewport=page.getViewport({scale:1.7}); const canvas=document.createElement("canvas"); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height); const context=canvas.getContext("2d"); if(!context) throw new Error("Your browser could not create an OCR canvas."); await page.render({canvasContext:context,viewport,canvas} as any).promise; const result=await worker.recognize(canvas); results.push({page:i,text:result.data.text.trim()}); onProgress?.(i/count); } } finally { await worker.terminate(); } return results;
}

type OcrWord = { text?: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
// tesseract.js >= 6 only returns words inside blocks > paragraphs > lines (request them with output { blocks: true }).
function collectWords(data: any): OcrWord[] {
  if (Array.isArray(data?.words)) return data.words;
  const out: OcrWord[] = [];
  for (const b of data?.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) out.push(w);
  return out;
}

export async function ocrPdfSearchable(file: File, maxPages = 20, onProgress?: (value: number) => void, language = "eng") {
  const {createWorker}=await import("tesseract.js"); const source=new Uint8Array(await file.arrayBuffer()); const pdf=await openPdfjsDocument(source); const out=await PDFDocument.load(source); const font=await out.embedFont(StandardFonts.Helvetica); const worker=await createWorker(language, 1, OCR_ASSETS); const count=Math.min(pdf.numPages,maxPages);
  try { for(let i=1;i<=count;i++){ const sourcePage=await pdf.getPage(i); const page=out.getPage(i-1); const scale=1.7; const viewport=sourcePage.getViewport({scale}); const canvas=document.createElement("canvas"); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height); const context=canvas.getContext("2d"); if(!context) throw new Error("Your browser could not create an OCR canvas."); await sourcePage.render({canvasContext:context,viewport,canvas} as any).promise; const result=await worker.recognize(canvas,{},{blocks:true}); const pageHeight=page.getHeight(); for(const word of collectWords(result.data)){const value=word.text?.trim(); if(!value) continue; const x=word.bbox.x0/scale; const y=pageHeight-word.bbox.y1/scale; const size=Math.max(5,(word.bbox.y1-word.bbox.y0)/scale); try{page.drawText(value,{x,y,size,font,color:rgb(1,1,1),opacity:0})}catch{/* glyph not encodable in the built-in font (e.g. Devanagari): skip that word in the invisible text layer */};} onProgress?.(i/count); } } finally { await worker.terminate(); } return out.save();
}
