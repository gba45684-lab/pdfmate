"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  addPageNumbers, addSignature, addWatermark, cropPages, deletePages, extractPages, flattenPdf, imagesToPdf,
  annotatePdf, compressPdf, fillPdfForm, getPdfFormFields, mergePdfs, reorderPages, resizePdf, rotatePages
} from "../lib/pdf-tools";
import { pdfToImages, renderPdfPreviews, type PdfPagePreview } from "../lib/pdf-render";
import { extractPdfText } from "../lib/pdf-ai";
import { ocrPdf } from "../lib/pdf-ocr";

type Action = "merge"|"extract"|"delete"|"rotate"|"reorder"|"watermark"|"pagenumbers"|"images"|"pdfimages"|"sign"|"crop"|"flatten"|"resize"|"edit"|"forms"|"ocr"|"compress";
type Tool = {
  id: string; name: string; description: string; accept: string; available: boolean;
  needsSpec?: boolean; needsText?: boolean; action: Action;
};

const tools: Tool[] = [
  { id:"merge", name:"Merge PDF", description:"Combine multiple PDFs in the order you choose.", accept:".pdf,application/pdf", available:true, action:"merge" },
  { id:"split", name:"Split PDF", description:"Extract any page range into a new PDF.", accept:".pdf,application/pdf", needsSpec:true, available:true, action:"extract" },
  { id:"extract", name:"Extract Pages", description:"Create a new PDF from selected pages.", accept:".pdf,application/pdf", needsSpec:true, available:true, action:"extract" },
  { id:"delete", name:"Delete Pages", description:"Remove selected pages from a PDF.", accept:".pdf,application/pdf", needsSpec:true, available:true, action:"delete" },
  { id:"rotate", name:"Rotate PDF", description:"Rotate selected pages by 90, 180 or 270 degrees.", accept:".pdf,application/pdf", needsSpec:true, available:true, action:"rotate" },
  { id:"reorder", name:"Reorder PDF", description:"Enter the complete page order and export it.", accept:".pdf,application/pdf", needsSpec:true, available:true, action:"reorder" },
  { id:"watermark", name:"Watermark", description:"Add a light text watermark to every page.", accept:".pdf,application/pdf", needsText:true, available:true, action:"watermark" },
  { id:"numbers", name:"Page Numbers", description:"Add page numbers to the bottom of every page.", accept:".pdf,application/pdf", available:true, action:"pagenumbers" },
  { id:"images", name:"Images to PDF", description:"Combine JPG and PNG images into one PDF.", accept:"image/png,image/jpeg", available:true, action:"images" },
  { id:"pdfimages", name:"PDF to Images", description:"Render every PDF page as PNG or JPG in your browser.", accept:".pdf,application/pdf", available:true, action:"pdfimages" },
  { id:"sign", name:"Sign PDF", description:"Draw a signature and place it on selected PDF pages.", accept:".pdf,application/pdf", needsSpec:true, available:true, action:"sign" },
  { id:"crop", name:"Crop PDF", description:"Trim equal margins from every page.", accept:".pdf,application/pdf", available:true, action:"crop" },
  { id:"flatten", name:"Flatten PDF", description:"Flatten interactive form fields into the document.", accept:".pdf,application/pdf", available:true, action:"flatten" },
  { id:"resize", name:"Resize PDF", description:"Fit every page to A4, Letter, Legal or A5.", accept:".pdf,application/pdf", available:true, action:"resize" },
  { id:"edit", name:"Edit PDF", description:"Add text, highlights, boxes and lines to PDF pages.", accept:".pdf,application/pdf", available:true, action:"edit" },
  { id:"forms", name:"Fill PDF Forms", description:"Detect and fill standard AcroForm text fields locally.", accept:".pdf,application/pdf", available:true, action:"forms" },
  { id:"ocr", name:"OCR PDF", description:"Recognize text in scanned PDF pages locally.", accept:".pdf,application/pdf", available:true, action:"ocr" },
  { id:"compress", name:"Optimize PDF", description:"Reduce PDF overhead and metadata locally when possible.", accept:".pdf,application/pdf", available:true, action:"compress" },
  { id:"protect", name:"Protect PDF", description:"Password encryption will use the secure server pipeline.", accept:".pdf,application/pdf", available:false, action:"merge" },
  { id:"ai", name:"AI PDF", description:"Ask questions about selectable text in your PDF.", accept:".pdf,application/pdf", available:true, action:"merge" },
];

function downloadPdf(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  downloadBlob(blob, name);
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [active, setActive] = useState<Tool | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [spec, setSpec] = useState("");
  const [text, setText] = useState("");
  const [angle, setAngle] = useState(90);
  const [imageFormat, setImageFormat] = useState<"png"|"jpeg">("png");
  const [pageSize, setPageSize] = useState<"a4"|"letter"|"legal"|"a5">("a4");
  const [editType, setEditType] = useState<"text"|"highlight"|"rect"|"line"|"whiteout">("text");
  const [editPage, setEditPage] = useState(1);
  const [editText, setEditText] = useState("");
  const [editX, setEditX] = useState(48);
  const [editY, setEditY] = useState(72);
  const [formFields, setFormFields] = useState<{name:string;type:string}[]>([]);
  const [formValues, setFormValues] = useState<Record<string,string>>({});
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
const [ocrLanguage, setOcrLanguage] = useState("eng");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [signatureReady, setSignatureReady] = useState(false);
  const [previews, setPreviews] = useState<PdfPagePreview[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [dragPage, setDragPage] = useState<number | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!active || active.id !== "sign" || !canvas.current) return;
    const c = canvas.current, ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    setSignatureReady(false);
  }, [active]);

  function openTool(tool: Tool) {
    setActive(tool); setFiles([]); setSpec(""); setText(""); setStatus(""); setAiPrompt(""); setAiAnswer("");
    setSignatureReady(false); setPreviews([]); setOrder([]); setDragPage(null); setEditPage(1); setEditText(""); setEditType("text"); setEditX(48); setEditY(72); setFormFields([]); setFormValues({}); setOcrText(""); setOcrProgress(0); setOcrLanguage("eng");
    requestAnimationFrame(() => input.current?.click());
  }

  async function loadOrganizer(file: File) {
    setStatus("Checking page count…");
    try {
      const { getPdfPageCount } = await import("../lib/pdf-tools");
      const count = await getPdfPageCount(file);
      if (count > 60) {
        setPreviews([]); setOrder([]);
        setStatus("This PDF has " + count + " pages. Visual arranging is limited to 60 pages; use the page-order field below.");
        return;
      }
      setStatus("Creating page previews locally…");
      const pages = await renderPdfPreviews(file, 60);
      setPreviews(pages);
      setOrder(pages.map((page) => page.index));
      setStatus(pages.length + " page previews ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not render page previews.");
    }
  }

  function movePage(from: number, to: number) {
    setOrder((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);
      if (fromIndex < 0 || toIndex < 0) return current;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, from);
      return next;
    });
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * c.width / rect.width, y: (e.clientY - rect.top) * c.height / rect.height };
  }
  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current, ctx = c?.getContext("2d"); if (!c || !ctx) return;
    drawing.current = true; c.setPointerCapture(e.pointerId);
    const p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); setSignatureReady(true);
  }
  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    const p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function stopDraw() { drawing.current = false; }

  async function run() {
    if (!active || !active.available || !files.length) return;
    setBusy(true); setStatus(active.id === "ai" ? "Reading PDF text locally…" : "Processing locally…");
    try {
      if (active.id === "ai") {
        const extracted = await extractPdfText(files[0]);
        if (!extracted.trim()) throw new Error("No selectable text was found in this PDF.");
        if (!aiPrompt.trim()) throw new Error("Enter a question first.");
        if (aiPrompt.length > 4000) throw new Error("Keep the question under 4,000 characters.");
        const response = await fetch("/api/ai", { method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ messages:[
            {role:"system",content:"Answer only from the supplied PDF text. If the answer is not present, say so clearly."},
            {role:"user",content:"PDF TEXT:\n"+extracted+"\n\nQUESTION:\n"+aiPrompt}
          ]})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "AI request failed.");
        setAiAnswer(data.text || "No answer returned."); setStatus("AI answer ready."); return;
      }
      if (active.action === "compress") {
        const bytes = await compressPdf(files[0]);
        downloadPdf(bytes, "pdfmate-optimized.pdf");
        setStatus("Optimized PDF created locally. Size reduction depends on the source PDF.");
        return;
      }
      if (active.action === "pdfimages") {
        const images = await pdfToImages(files[0], imageFormat);
        const zip = new JSZip();
        images.forEach(({ name, blob }) => zip.file(name, blob));
        const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        downloadBlob(archive, "pdfmate-images.zip");
        setStatus(images.length + " image(s) packaged into a ZIP locally.");
        return;
      }      if (active.action === "crop") {
        const bytes = await cropPages(files[0], Number(spec) || 24);
        downloadPdf(bytes, "pdfmate-cropped.pdf");
        setStatus("Cropped PDF created locally.");
        return;
      }
      if (active.action === "flatten") {
        const bytes = await flattenPdf(files[0]);
        downloadPdf(bytes, "pdfmate-flattened.pdf");
        setStatus("Flattened PDF created locally.");
        return;
      }
      if (active.action === "ocr") {
        setOcrText(""); setOcrProgress(0);
        const pages = await ocrPdf(files[0], 20, setOcrProgress, ocrLanguage);
        const text = pages.map(page => "--- Page " + page.page + " ---\\n" + page.text).join("\\n\\n");
        setOcrText(text);
        setStatus("OCR complete: " + pages.length + " page(s) processed.");
        return;
      }
      if (active.action === "forms") {
        const bytes = await fillPdfForm(files[0], formValues);
        downloadPdf(bytes, "pdfmate-filled-form.pdf");
        setStatus("Filled PDF form created locally.");
        return;
      }
      if (active.action === "edit") {
        if (editPage < 1) throw new Error("Enter a valid page number.");
        if (editType === "text" && !editText.trim()) throw new Error("Enter text to add.");
        const annotation = editType === "text"
          ? { type: "text" as const, page: editPage - 1, x: editX, y: editY, text: editText.trim(), size: 16 }
          : editType === "highlight"
            ? { type: "highlight" as const, page: editPage - 1, x: editX, y: editY, width: 240, height: 24 }
            : editType === "rect"
              ? { type: "rect" as const, page: editPage - 1, x: editX, y: editY, width: 240, height: 90 }
              : editType === "line"
        ? { type: "line" as const, page: editPage - 1, x1: editX, y1: editY, x2: editX + 240, y2: editY }
        : { type: "whiteout" as const, page: editPage - 1, x: 48, y: 600, width: 240, height: 90 };
        const bytes = await annotatePdf(files[0], [annotation]);
        downloadPdf(bytes, "pdfmate-edited.pdf");
        setStatus("Edited PDF created locally.");
        return;
      }
      if (active.action === "resize") {
        const bytes = await resizePdf(files[0], pageSize);
        downloadPdf(bytes, "pdfmate-" + pageSize + ".pdf");
        setStatus("Resized PDF created locally.");
        return;
      }
      if (active.action === "sign") {
        if (!signatureReady || !canvas.current) throw new Error("Draw your signature first.");
        const signature = canvas.current.toDataURL("image/png");
        const bytes = await addSignature(files[0], signature, spec);
        downloadPdf(bytes, "pdfmate-signed.pdf");
        setStatus("Signed PDF created locally.");
        return;
      }
      let bytes: Uint8Array; let name: string;
      switch (active.action) {
        case "merge": bytes = await mergePdfs(files); name = "pdfmate-merged.pdf"; break;
        case "images": bytes = await imagesToPdf(files); name = "pdfmate-images.pdf"; break;
        case "extract": bytes = await extractPages(files[0], spec); name = "pdfmate-extract.pdf"; break;
        case "delete": bytes = await deletePages(files[0], spec); name = "pdfmate-deleted.pdf"; break;
        case "rotate": bytes = await rotatePages(files[0], spec, angle); name = "pdfmate-rotated.pdf"; break;
        case "reorder": bytes = await reorderPages(files[0], spec); name = "pdfmate-reordered.pdf"; break;
        case "watermark": bytes = await addWatermark(files[0], text || "PDFMate"); name = "pdfmate-watermarked.pdf"; break;
        case "pagenumbers": bytes = await addPageNumbers(files[0]); name = "pdfmate-numbered.pdf"; break;
        case "crop": bytes = await cropPages(files[0], Number(spec) || 24); name = "pdfmate-cropped.pdf"; break;
        case "flatten": bytes = await flattenPdf(files[0]); name = "pdfmate-flattened.pdf"; break;\n        case "resize": bytes = await resizePdf(files[0], pageSize); name = "pdfmate-" + pageSize + ".pdf"; break;
        default: throw new Error("This tool is not available yet.");
      }
      downloadPdf(bytes, name);
      setStatus("Done — the PDF was created locally in your browser.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Processing failed. Check the file and settings.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#09090b]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="text-xl font-bold">PDF<span className="text-violet-400">Mate</span></div>
        <nav className="hidden gap-7 text-sm text-zinc-400 md:flex"><a href="#tools">Tools</a><a href="#workflow">How it works</a><a href="#privacy">Privacy</a></nav>
        <button className="rounded-xl border border-zinc-700 px-4 py-2 text-sm">Sign in</button>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 text-center">
        <div className="mb-5 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs text-violet-300">FAST · PRIVATE · PDF-FIRST</div>
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">Your PDFs.<br/><span className="text-violet-400">Simplified.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-400">A browser-first PDF workspace for merging, splitting, signing and transforming documents.</p>
        <button onClick={() => openTool(tools[0])} className="mx-auto mt-10 block w-full max-w-2xl rounded-3xl border border-dashed border-zinc-700 bg-zinc-950 px-6 py-14 shadow-2xl transition hover:border-violet-400 hover:bg-violet-500/5">
          <div className="text-lg font-semibold">Drop PDFs here or choose files</div>
          <div className="mt-2 text-sm text-zinc-500">Local-first processing — files are not uploaded for these tools.</div>
        </button>
      </section>

      <section id="tools" className="mx-auto max-w-7xl px-6 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-semibold">PDF tools</h2><p className="mt-2 text-zinc-500">Browser operations are ready. Secure server features can use the same workspace.</p></div><span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500">{tools.length} tools</span></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map(tool => <article key={tool.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition hover:border-violet-500/40">
            <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">PDF</div>
            <h3 className="font-semibold">{tool.name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-zinc-500">{tool.description}</p>
            <button onClick={() => tool.available && openTool(tool)} disabled={!tool.available} className="mt-5 text-sm text-violet-300 hover:text-violet-200 disabled:cursor-default disabled:text-zinc-600">{tool.available ? "Open tool →" : "Coming soon"}</button>
          </article>)}
        </div>
      </section>

      <section id="workflow" className="border-y border-zinc-900 bg-zinc-950 px-6 py-20">
        <div className="mx-auto max-w-5xl"><h2 className="text-3xl font-semibold">One workspace, simple flow</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{["Choose a tool","Process locally","Download result"].map((x,i)=><div key={x} className="rounded-2xl border border-zinc-800 p-6"><div className="text-sm text-violet-300">0{i+1}</div><h3 className="mt-4 font-semibold">{x}</h3><p className="mt-2 text-sm text-zinc-500">Focused controls with no unnecessary document uploads.</p></div>)}</div></div>
      </section>
      <footer id="privacy" className="mx-auto max-w-7xl px-6 py-10 text-sm text-zinc-600">PDFMate · Privacy-first PDF workspace</footer>

      <input ref={input} hidden type="file" multiple accept={active?.accept} onChange={e => setFiles(Array.from(e.target.files || []))}/>

      {active && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4" role="dialog" aria-modal="true">
        <div className="my-6 w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          <div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{active.name}</h2><p className="mt-1 text-sm text-zinc-500">{active.description}</p></div><button onClick={() => setActive(null)} className="rounded-lg px-2 py-1 text-zinc-400">✕</button></div>
          <button onClick={() => input.current?.click()} className="mt-6 w-full rounded-2xl border border-dashed border-zinc-700 px-5 py-9 text-sm hover:border-violet-400">{files.length ? String(files.length) + " file(s) selected — choose again" : "Choose files"}</button>
          {files.length > 0 && <div className="mt-3 max-h-24 overflow-auto rounded-xl bg-zinc-900 p-3 text-sm text-zinc-400">{files.map(f => <div key={f.name + f.size} className="truncate">{f.name}</div>)}</div>}
          {active.id === "reorder" && files[0] && <button onClick={() => loadOrganizer(files[0])} className="mt-4 w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm hover:border-violet-500">Preview & arrange pages</button>}
          {active.id === "reorder" && order.length > 0 && <div className="mt-4 grid max-h-72 grid-cols-3 gap-3 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:grid-cols-4">
            {order.map((pageNumber) => { const preview = previews.find((item) => item.index === pageNumber); return <div key={pageNumber} draggable onDragStart={() => setDragPage(pageNumber)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragPage !== null) movePage(dragPage, pageNumber); setDragPage(null); }} className="cursor-grab rounded-lg border border-zinc-800 bg-zinc-950 p-2 active:cursor-grabbing"><div className="aspect-[3/4] overflow-hidden rounded bg-white">{preview && <img src={preview.url} alt={"Page " + pageNumber} className="h-full w-full object-contain"/></div><div className="pt-2 text-center text-xs text-zinc-400">Page {pageNumber}</div></div>; })}
          </div>}
          {active.id === "reorder" && order.length > 0 && <button onClick={() => setSpec(order.join(","))} className="mt-3 w-full rounded-xl border border-violet-500/40 px-4 py-2 text-sm text-violet-300">Use this page order</button>}
          {active.needsSpec && <><label className="mt-5 block text-sm text-zinc-400">{active.id === "sign" ? "Pages to sign (blank = every page)" : "Pages"}</label><input value={spec} onChange={e => setSpec(e.target.value)} placeholder="Example: 1,3-5,8" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/></>}
          {active.id === "crop" && <><label className="mt-5 block text-sm text-zinc-400">Margin to remove (points)</label><input value={spec} onChange={e => setSpec(e.target.value)} inputMode="numeric" placeholder="24" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/></>}
          {active.id === "rotate" && <><label className="mt-5 block text-sm text-zinc-400">Rotation</label><select value={angle} onChange={e => setAngle(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></>}
          {active.id === "ocr" && <div className="mt-5"><p className="text-sm text-zinc-400">OCR runs in your browser. Up to 20 pages are processed per run.</p><select value={ocrLanguage} onChange={e=>setOcrLanguage(e.target.value)} className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm"><option value="eng">English</option><option value="eng+hin">English + Hindi</option></select><div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-violet-500 transition-all" style={{width: Math.round(ocrProgress*100)+"%"}} /></div>{ocrText && <textarea value={ocrText} readOnly className="mt-4 h-56 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300" />}</div>}{active.id === "forms" && <div className="mt-5">
<button type="button" onClick={async()=>{try{setStatus("Detecting form fields…");const fields=await getPdfFormFields(files[0]);setFormFields(fields);setFormValues(Object.fromEntries(fields.map(f=>[f.name,""])));setStatus(fields.length+" fillable field(s) detected.");}catch(e){setStatus(e instanceof Error?e.message:"Could not inspect PDF form.");}}} className="w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm hover:border-violet-500">Detect form fields</button>
<div className="mt-3 space-y-3">{formFields.map(field=><label key={field.name} className="block text-sm text-zinc-400">{field.name}{/CheckBox/i.test(field.type) ? <select value={formValues[field.name]||""} onChange={e=>setFormValues(v=>({...v,[field.name]:e.target.value}))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white"><option value="">Unchecked</option><option value="true">Checked</option></select> : <input value={formValues[field.name]||""} onChange={e=>setFormValues(v=>({...v,[field.name]:e.target.value}))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white" placeholder={field.type}/>}</label>)}</div>
</div>}{active.id === "edit" && <div className="mt-5 space-y-3">
<label className="block text-sm text-zinc-400">Edit type</label>
<select value={editType} onChange={e => setEditType(e.target.value as "text"|"highlight"|"rect"|"line"|"whiteout")} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="text">Add text</option><option value="highlight">Highlight</option><option value="rect">Rectangle</option><option value="line">Line</option><option value="whiteout">Whiteout</option></select>
<div className="grid grid-cols-2 gap-3"><input value={editPage} onChange={e => setEditPage(Number(e.target.value)||1)} type="number" min="1" placeholder="Page" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/>{editType === "text" && <input value={editText} onChange={e => setEditText(e.target.value)} placeholder="Text to add" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/>}</div>
<div className="grid grid-cols-2 gap-3"><input type="number" value={editX} onChange={e=>setEditX(Number(e.target.value)||0)} placeholder="X" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/><input type="number" value={editY} onChange={e=>setEditY(Number(e.target.value)||0)} placeholder="Y" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/></div><button type="button" onClick={async()=>{try{setStatus("Rendering editor preview…");const pages=await renderPdfPreviews(files[0],60);setPreviews(pages);setStatus("Click the page preview to place the annotation.");}catch(e){setStatus(e instanceof Error?e.message:"Could not render editor preview.");}}} className="w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm hover:border-violet-500">Load visual editor</button>{previews.filter(p=>p.index===editPage).map(p=><button type="button" key={p.index} onClick={e=>{const r=(e.currentTarget as HTMLElement).getBoundingClientRect();const scale=.55;setEditX(Math.round((e.clientX-r.left)/scale));setEditY(Math.round((r.height-(e.clientY-r.top))/scale));}} className="block w-full overflow-hidden rounded-lg border border-zinc-700 hover:border-violet-400"><img src={p.url} alt={"Page "+p.index+" preview"} className="w-full"/></button>)}<p className="text-xs text-zinc-600">Click the preview to place the selected edit tool. Coordinates are stored in PDF points.</p>
</div>}{active.id === "resize" && <><label className="mt-5 block text-sm text-zinc-400">Target page size</label><select value={pageSize} onChange={e => setPageSize(e.target.value as "a4"|"letter"|"legal"|"a5")} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="a5">A5</option></select><p className="mt-2 text-xs text-zinc-600">Pages are proportionally fitted and centered on the selected size.</p></>}{active.id === "pdfimages" && <><label className="mt-5 block text-sm text-zinc-400">Image format</label><select value={imageFormat} onChange={e => setImageFormat(e.target.value as "png"|"jpeg")} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="png">PNG</option><option value="jpeg">JPG</option></select></>}
          {active.id === "sign" && <div className="mt-5"><label className="block text-sm text-zinc-400">Draw your signature</label><canvas ref={canvas} width={900} height={260} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={stopDraw} onPointerCancel={stopDraw} className="mt-2 h-40 w-full touch-none rounded-xl border border-zinc-700 bg-white"/><button type="button" onClick={() => { const c=canvas.current,ctx=c?.getContext("2d"); if(c&&ctx){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);setSignatureReady(false);} }} className="mt-2 text-sm text-zinc-500 hover:text-zinc-300">Clear signature</button></div>}
          {active.id === "ai" && <><label className="mt-5 block text-sm text-zinc-400">Ask your PDF</label><textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Summarize this document, find the key dates, explain section 3…" className="mt-2 min-h-28 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/>{aiAnswer && <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm leading-6 text-zinc-300 whitespace-pre-wrap">{aiAnswer}</div>}</>}
          {active.needsText && <><label className="mt-5 block text-sm text-zinc-400">Watermark text</label><input value={text} onChange={e => setText(e.target.value)} placeholder="CONFIDENTIAL" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/></>}
          <button disabled={!files.length || busy} onClick={run} className="mt-6 w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold disabled:opacity-40">{busy ? "Processing…" : active.id === "ai" ? "Ask PDF" : "Process & download"}</button>
          {status && <p className="mt-4 text-center text-sm text-zinc-400">{status}</p>}
          <p className="mt-5 text-center text-xs text-zinc-600">Browser-supported operations run locally. Encryption, OCR, compression and advanced conversion will use the secure server pipeline.</p>
        </div>
      </div>}
    </main>
  );
}
