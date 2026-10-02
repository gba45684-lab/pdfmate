import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type OcrPage = { page: number; text: string };

export async function ocrPdf(file: File, maxPages = 20, onProgress?: (value: number) => void, language = "eng"): Promise<OcrPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); const { createWorker } = await import("tesseract.js");
  const data = new Uint8Array(await file.arrayBuffer()); const pdf = await pdfjs.getDocument({ data, disableWorker: true } as any).promise;
  const count = Math.min(pdf.numPages, maxPages); const worker = await createWorker(language); const results: OcrPage[] = [];
  try { for (let i=1;i<=count;i++){ const page=await pdf.getPage(i); const viewport=page.getViewport({scale:1.7}); const canvas=document.createElement("canvas"); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height); const context=canvas.getContext("2d"); if(!context) throw new Error("Your browser could not create an OCR canvas."); await page.render({canvasContext:context,viewport,canvas} as any).promise; const result=await worker.recognize(canvas); results.push({page:i,text:result.data.text.trim()}); onProgress?.(i/count); } } finally { await worker.terminate(); } return results;
}

export async function ocrPdfSearchable(file: File, maxPages = 20, onProgress?: (value: number) => void, language = "eng") {
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs"); const {createWorker}=await import("tesseract.js"); const source=new Uint8Array(await file.arrayBuffer()); const pdf=await pdfjs.getDocument({data:source,disableWorker:true} as any).promise; const out=await PDFDocument.load(source); const font=await out.embedFont(StandardFonts.Helvetica); const worker=await createWorker(language); const count=Math.min(pdf.numPages,maxPages);
  try { for(let i=1;i<=count;i++){ const sourcePage=await pdf.getPage(i); const page=out.getPage(i-1); const scale=1.7; const viewport=sourcePage.getViewport({scale}); const canvas=document.createElement("canvas"); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height); const context=canvas.getContext("2d"); if(!context) throw new Error("Your browser could not create an OCR canvas."); await sourcePage.render({canvasContext:context,viewport,canvas} as any).promise; const result=await worker.recognize(canvas); const pageHeight=page.getHeight(); for(const word of result.data.words||[]){const value=word.text?.trim(); if(!value) continue; const x=word.bbox.x0/scale; const y=pageHeight-word.bbox.y1/scale; const size=Math.max(5,(word.bbox.y1-word.bbox.y0)/scale); page.drawText(value,{x,y,size,font,color:rgb(1,1,1),opacity:0});} onProgress?.(i/count); } } finally { await worker.terminate(); } return out.save();
}
