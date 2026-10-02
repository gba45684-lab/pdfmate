"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  addPageNumbers, addSignature, addWatermark, cropPages, deletePages, extractPages, flattenPdf, imagesToPdf,
  annotatePdf, fillPdfForm, getPdfFormFields, inspectPdf, mergePdfs, secureRedactPdf, reorderPages, resizePdf, rotatePages
} from "../lib/pdf-tools";
import { pdfToImages, renderPdfPreviews, type PdfPagePreview } from "../lib/pdf-render";
import { extractPdfText } from "../lib/pdf-ai";
import { ocrPdf, ocrPdfSearchable } from "../lib/pdf-ocr";
import { createSupabaseBrowserClient } from "../lib/supabase";

type Action = "merge"|"extract"|"delete"|"rotate"|"reorder"|"watermark"|"pagenumbers"|"images"|"pdfimages"|"sign"|"crop"|"flatten"|"resize"|"edit"|"forms"|"ocr"|"compress"|"auto"|"redact"|"protect"|"office";
type Tool = {
  id: string; name: string; description: string; accept: string; available: boolean;
  needsSpec?: boolean; needsText?: boolean; action: Action;
};

const tools: Tool[] = [
  { id:"redact", name:"Redact PDF", description:"Rasterize pages with redactions burned into the page image so the covered source text is not retained as selectable PDF text.", accept:".pdf,application/pdf", available:true, action:"redact" },
  { id:"auto", name:"Auto PDF Mode", description:"Inspect your PDF and choose the most useful next action automatically.", accept:".pdf,application/pdf", available:true, action:"auto" },
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
  { id:"compress", name:"Optimize PDF", description:"Use the secure qpdf worker for deeper PDF optimization.", accept:".pdf,application/pdf", available:true, action:"compress" },
  { id:"office", name:"Office to PDF", description:"Convert DOCX, XLSX or PPTX files using the isolated LibreOffice worker.", accept:".doc,.docx,.xls,.xlsx,.ppt,.pptx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation", available:true, action:"office" },
  { id:"protect", name:"Protect PDF", description:"Password encryption will use the secure server pipeline.", accept:".pdf,application/pdf", available:true, action:"protect" },
  { id:"ai", name:"AI PDF", description:"Ask questions about selectable text in your PDF.", accept:".pdf,application/pdf", available:true, action:"merge" },
];

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
  const [editW, setEditW] = useState(180);
  const [editH, setEditH] = useState(40);
  const [formFields, setFormFields] = useState<{name:string;type:string}[]>([]);
  const [formValues, setFormValues] = useState<Record<string,string>>({});
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
const [ocrLanguage, setOcrLanguage] = useState("eng");
  const [ocrSearchable, setOcrSearchable] = useState(true);
  const [cloudDocs, setCloudDocs] = useState<{id:string;name:string;size_bytes:number;created_at:string}[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [protectPassword, setProtectPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [redactWidth, setRedactWidth] = useState(180);
  const [redactHeight, setRedactHeight] = useState(40);
  const [toolSearch, setToolSearch] = useState("");
  const [toolCategory, setToolCategory] = useState("All");
  const toolCategories = ["All","Organize","Edit","Convert","Smart"] as const;
  const [recentTools, setRecentTools] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("pdfmate-recent-tools") || "[]"); } catch { return []; }
  });
  const [autoReport, setAutoReport] = useState<{pages:number;formFields:number;portrait:number;landscape:number;recommendation:string}|null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [signatureReady, setSignatureReady] = useState(false);
  const [previews, setPreviews] = useState<PdfPagePreview[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [result, setResult] = useState<{name:string; blob:Blob; preview:boolean} | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const visibleTools = tools.filter((tool) => {
    const category = tool.id === "ai" || tool.id === "auto" || tool.id === "ocr" || tool.id === "compress" || tool.id === "protect" ? "Smart" :
      ["merge","split","extract","delete","rotate","reorder","crop","resize"].includes(tool.id) ? "Organize" :
      ["images","pdfimages","office"].includes(tool.id) ? "Convert" : "Edit";
    const q = toolSearch.trim().toLowerCase();
    return (toolCategory === "All" || category === toolCategory) && (!q || (tool.name + " " + tool.description).toLowerCase().includes(q));
  });


  useEffect(() => {
    loadCloudDocs();

    // Native APK loads the production site. Do not let an old service-worker
    // cache pin the WebView to a previous deployment. On every fresh app launch,
    // clear native WebView caches once, then reload with a cache-busting query.
    const capacitor = (window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    const isNativeApp = capacitor?.isNativePlatform?.() === true;

    if (isNativeApp) {
      const refreshKey = "pdfmate-native-launch-refresh-v1";
      if (!sessionStorage.getItem(refreshKey)) {
        sessionStorage.setItem(refreshKey, "1");
        const refresh = async () => {
          try {
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((registration) => registration.unregister()));
            }
            if ("caches" in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map((key) => caches.delete(key)));
            }
          } catch {}
          const url = new URL(window.location.href);
          url.searchParams.set("pdfmate_refresh", String(Date.now()));
          window.location.replace(url.toString());
        };
        void refresh();
      }
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
        registration.update().catch(() => {});
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      }).catch(() => {});
      const onControllerChange = () => window.location.reload();
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
    }
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

  async function loadCloudDocs() {
    setCloudLoading(true);
    try { const response=await fetch("/api/documents"); const data=await response.json(); if(response.ok) setCloudDocs(data.documents||[]); } finally { setCloudLoading(false); }
  }
  async function saveCloudDocument(file: File) {
    setCloudSaving(true);
    try {
      const uploadResponse = await fetch("/api/storage/upload-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name})});
      const uploadData = await uploadResponse.json().catch(()=>null);
      if(!uploadResponse.ok) throw new Error(uploadData?.error || "Sign in to enable cloud storage.");
      const supabase=createSupabaseBrowserClient();
      if(!supabase) throw new Error("Supabase is not configured.");
      const upload=await supabase.storage.from(uploadData.bucket).uploadToSignedUrl(uploadData.path,uploadData.token,file);
      if(upload.error) throw upload.error;
      const response=await fetch("/api/documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,size_bytes:file.size,storage_path:uploadData.path})});
      if(!response.ok){await supabase.storage.from(uploadData.bucket).remove([uploadData.path]); const data=await response.json().catch(()=>null); throw new Error(data?.error || "Could not save cloud metadata.");}
      await loadCloudDocs();
      setStatus("Saved to your private cloud storage.");
    } finally { setCloudSaving(false); }
  }
  async function downloadCloudDocument(id:string) {
    const popup=window.open("about:blank","_blank");
    try {
      const response=await fetch("/api/storage/download-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({document_id:id})});
      const data=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(data?.error || "Could not create download link.");
      if(popup) popup.location.href=data.url;
      else window.location.href=data.url;
    } catch(error) {
      if(popup) popup.close();
      throw error;
    }
  }
  async function deleteCloudDocument(id:string) {
    const response=await fetch("/api/documents/"+encodeURIComponent(id),{method:"DELETE"});
    const data=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.error || "Could not delete cloud document.");
    await loadCloudDocs();
  }

  function openTool(tool: Tool) {
    setRecentTools(prev => { const next=[tool.name,...prev.filter(x=>x!==tool.name)].slice(0,6); try { localStorage.setItem("pdfmate-recent-tools", JSON.stringify(next)); } catch {} return next; });
    if(resultUrl) URL.revokeObjectURL(resultUrl); setActive(tool); setFiles([]); setPreviews([]); setSpec(""); setText(""); setStatus(""); setAiPrompt(""); setAiAnswer(""); setResult(null); setResultUrl(""); setBusy(false);
    setSignatureReady(false); setAutoReport(null); setRedactWidth(180); setRedactHeight(40); setOrder([]); setDragPage(null); setEditPage(1); setEditText(""); setEditType("text"); setEditX(48); setEditY(72); setEditW(180); setEditH(40); setFormFields([]); setFormValues({}); setOcrText(""); setOcrProgress(0); setOcrLanguage("eng"); setOcrSearchable(true); setProtectPassword("");
    requestAnimationFrame(() => { if (input.current) { input.current.value = ""; input.current.click(); } });
  }

  function closeTool() { if(resultUrl) URL.revokeObjectURL(resultUrl); setActive(null); setFiles([]); setPreviews([]); setResult(null); setResultUrl(""); setStatus(""); setBusy(false); }
  function deliverBlob(blob: Blob, name: string) { const url=URL.createObjectURL(blob); setResultUrl(url); setResult({name,blob,preview:blob.type==="application/pdf"||name.toLowerCase().endsWith(".pdf")}); setStatus("Result ready — review it, then download when you are ready."); }
  function deliverPdf(bytes: Uint8Array, name: string) { deliverBlob(new Blob([bytes as BlobPart], {type:"application/pdf"}), name); }
  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected=Array.from(event.target.files||[]); if(!active||!selected.length)return;
    const isImageTool=active.id==="images", isOfficeTool=active.id==="office";
    const valid=selected.filter(file=>{const lower=file.name.toLowerCase(); if(isImageTool)return file.type==="image/png"||file.type==="image/jpeg"||/\.(png|jpe?g)$/.test(lower); if(isOfficeTool)return /\.(doc|docx|xls|xlsx|ppt|pptx)$/.test(lower); return file.type==="application/pdf"||lower.endsWith(".pdf");});
    const multiple=active.id==="merge"||active.id==="images", picked=multiple?valid:valid.slice(0,1);
    if(!picked.length){setFiles([]);setStatus(isImageTool?"Select JPG or PNG images.":isOfficeTool?"Select a DOC, DOCX, XLS, XLSX, PPT or PPTX file.":"Select a PDF file.");event.target.value="";return;}
    if(resultUrl) URL.revokeObjectURL(resultUrl); setFiles(picked);setResult(null);setResultUrl("");setPreviews([]);setOrder([]);setStatus(multiple&&valid.length!==selected.length?"Unsupported files were skipped.":picked.length+" file"+(picked.length===1?"":"s")+" ready.");
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
    if (!active || !active.available || !files.length) { setStatus("Choose a supported file first."); return; }
    if (active.id === "merge" && files.length < 2) { setStatus("Merge needs at least 2 PDF files."); return; }
    setBusy(true); setStatus(active.id === "ai" ? "Reading PDF text locally…" : "Processing locally…");
    try {
      if (active.action === "redact") {
        if (editPage < 1) throw new Error("Enter a valid page number.");
        const bytes = await secureRedactPdf(files[0], [{page: editPage - 1, x: editX, y: editY, width: redactWidth, height: redactHeight}]);
        deliverPdf(bytes, "pdfmate-redacted.pdf");
        setStatus("Redacted PDF result is ready. Verify the exported file before sharing.");
        return;
      }
      if (active.action === "office") {
        const form=new FormData(); form.append("file",files[0]); form.append("action","office-to-pdf");
        const response=await fetch("/api/pdf/worker",{method:"POST",body:form});
        if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||"Office conversion failed.");}
        deliverBlob(await response.blob(), "pdfmate-converted.pdf"); setStatus("Converted PDF result is ready."); return;
      }
      if (active.action === "compress") {
        const form=new FormData(); form.append("file",files[0]); form.append("action","compress");
        const response=await fetch("/api/pdf/worker",{method:"POST",body:form});
        if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||"Secure optimization failed.");}
        deliverBlob(await response.blob(), "pdfmate-optimized.pdf"); setStatus("Optimized PDF result is ready."); return;
      }
      if (active.action === "protect") {
        if (!protectPassword || protectPassword.length < 8) throw new Error("Use a password of at least 8 characters.");
        const form = new FormData();
        form.append("file", files[0]);
        form.append("password", protectPassword);
        const response = await fetch("/api/pdf/protect", { method:"POST", body: form });
        if (!response.ok) { const data=await response.json().catch(()=>null); throw new Error(data?.error || "Secure PDF protection failed."); }
        const protectedPdf = await response.blob();
        deliverBlob(protectedPdf, "pdfmate-protected.pdf");
        setStatus("Protected PDF result is ready.");
        return;
      }
      if (active.action === "auto") {
        const info = await inspectPdf(files[0]);
        const extracted = await extractPdfText(files[0], Math.min(info.pages, 5), 12000);
        const hasText = extracted.replace(/--- Page \d+ ---/g, "").trim().length > 80;
        const recommendation = info.formFields > 0
          ? "Fill PDF Forms — this document contains " + info.formFields + " form field(s)."
          : hasText
            ? "Optimize PDF or Edit PDF — selectable text is present, so OCR is usually unnecessary."
            : "OCR PDF — little/no selectable text was detected, so this appears suitable for OCR.";
        setAutoReport({...info, recommendation});

      setStatus("Auto analysis complete.");
        return;
      }
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
      if (active.action === "pdfimages") {
        const images = await pdfToImages(files[0], imageFormat);
        const zip = new JSZip();
        images.forEach(({ name, blob }) => zip.file(name, blob));
        const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        deliverBlob(archive, "pdfmate-images.zip");
        setStatus(images.length + " image(s) are ready in the ZIP result.");
        return;
      }      if (active.action === "crop") {
        const bytes = await cropPages(files[0], Number(spec) || 24);
        deliverPdf(bytes, "pdfmate-cropped.pdf");
        setStatus("Cropped PDF created locally.");
        return;
      }
      if (active.action === "flatten") {
        const bytes = await flattenPdf(files[0]);
        deliverPdf(bytes, "pdfmate-flattened.pdf");
        setStatus("Flattened PDF created locally.");
        return;
      }
      if (active.action === "ocr") {
        setOcrText(""); setOcrProgress(0);
        const bytes = ocrSearchable ? await ocrPdfSearchable(files[0], 20, setOcrProgress, ocrLanguage) : null;
        if (bytes) { deliverPdf(bytes, "pdfmate-searchable-ocr.pdf"); setStatus("Searchable OCR PDF created locally."); return; }
        const pages = await ocrPdf(files[0], 20, setOcrProgress, ocrLanguage);
        const text = pages.map(page => "--- Page " + page.page + " ---\\n" + page.text).join("\\n\\n");
        setOcrText(text);
        setStatus("OCR complete: " + pages.length + " page(s) processed.");
        return;
      }
      if (active.action === "forms") {
        const bytes = await fillPdfForm(files[0], formValues);
        deliverPdf(bytes, "pdfmate-filled-form.pdf");
        setStatus("Filled PDF form created locally.");
        return;
      }
      if (active.action === "edit") {
        if (editPage < 1) throw new Error("Enter a valid page number.");
        if (editType === "text" && !editText.trim()) throw new Error("Enter text to add.");
        const annotation = editType === "text"
          ? { type: "text" as const, page: editPage - 1, x: editX, y: editY, text: editText.trim(), size: 16 }
          : editType === "highlight"
            ? { type: "highlight" as const, page: editPage - 1, x: editX, y: editY, width: editW, height: editH }
            : editType === "rect"
              ? { type: "rect" as const, page: editPage - 1, x: editX, y: editY, width: editW, height: editH }
              : editType === "line"
        ? { type: "line" as const, page: editPage - 1, x1: editX, y1: editY, x2: editX + editW, y2: editY }
        : { type: "whiteout" as const, page: editPage - 1, x: editX, y: editY, width: editW, height: editH };
        const bytes = await annotatePdf(files[0], [annotation]);
        deliverPdf(bytes, "pdfmate-edited.pdf");
        setStatus("Edited PDF created locally.");
        return;
      }
      if (active.action === "resize") {
        const bytes = await resizePdf(files[0], pageSize);
        deliverPdf(bytes, "pdfmate-" + pageSize + ".pdf");
        setStatus("Resized PDF created locally.");
        return;
      }
      if (active.action === "sign") {
        if (!signatureReady || !canvas.current) throw new Error("Draw your signature first.");
        const signature = canvas.current.toDataURL("image/png");
        const bytes = await addSignature(files[0], signature, spec);
        deliverPdf(bytes, "pdfmate-signed.pdf");
        setStatus("Signed PDF created locally.");
        return;
      }
      let bytes: Uint8Array; let name: string;
      switch (active.action as string) {
        case "merge": bytes = await mergePdfs(files); name = "pdfmate-merged.pdf"; break;
        case "images": bytes = await imagesToPdf(files); name = "pdfmate-images.pdf"; break;
        case "extract": bytes = await extractPages(files[0], spec); name = "pdfmate-extract.pdf"; break;
        case "delete": bytes = await deletePages(files[0], spec); name = "pdfmate-deleted.pdf"; break;
        case "rotate": bytes = await rotatePages(files[0], spec, angle); name = "pdfmate-rotated.pdf"; break;
        case "reorder": bytes = await reorderPages(files[0], spec); name = "pdfmate-reordered.pdf"; break;
        case "watermark": bytes = await addWatermark(files[0], text || "PDFMate"); name = "pdfmate-watermarked.pdf"; break;
        case "pagenumbers": bytes = await addPageNumbers(files[0]); name = "pdfmate-numbered.pdf"; break;
        case "crop": bytes = await cropPages(files[0], Number(spec) || 24); name = "pdfmate-cropped.pdf"; break;
        case "flatten": bytes = await flattenPdf(files[0]); name = "pdfmate-flattened.pdf"; break;
        case "resize": bytes = await resizePdf(files[0], pageSize); name = "pdfmate-" + pageSize + ".pdf"; break;
        default: throw new Error("This tool is not available yet.");
      }
      deliverPdf(bytes, name);
      setStatus("Done — the PDF was created locally in your browser.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Processing failed. Check the file and settings.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-sm font-black text-white shadow-lg shadow-violet-200">P</div>
            <div><div className="text-lg font-extrabold tracking-tight">PDF<span className="text-violet-600">Mate</span></div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Workspace</div></div>
          </div>
          <nav className="flex-1 space-y-1 p-4 text-sm font-medium">
            <a href="#dashboard" className="flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-violet-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Dashboard</span></a>
            <a href="#tools" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg><span>PDF Tools</span></a>
            <a href="#cloud" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg><span>My Documents</span></a>
            <a href="#workflow" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg><span>Favourites</span></a>
            <div className="my-5 border-t border-slate-100"/>
            <div className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</div>
            <a href="#tools" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m12 3 1.5 6.5L20 11l-6.5 1.5L12 19l-1.5-6.5L4 11l6.5-1.5z"/></svg><span>AI PDF</span></a>
            <a href="/auth" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></svg><span>Account & Cloud</span></a>
          </nav>
          <div className="m-4 rounded-2xl bg-slate-950 p-4 text-white">
            <div className="text-xs font-semibold">Private by default</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Browser-first processing. Cloud storage is optional.</p>
            <a href="#privacy" className="mt-3 inline-flex text-xs font-semibold text-violet-300">Privacy details →</a>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-[68px] items-center justify-between gap-3 px-4 sm:h-20 sm:px-5 md:px-8">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-xs font-black text-white shadow-md shadow-violet-200">P</div>
                <div className="min-w-0"><div className="truncate text-[15px] font-extrabold tracking-tight">PDF<span className="text-violet-600">Mate</span></div><div className="hidden text-[9px] font-bold uppercase tracking-[.18em] text-slate-400 sm:block">Workspace</div></div>
              </div>
              <div className="relative hidden max-w-xl flex-1 md:block">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></div>
                <input aria-label="Search PDF tools" value={toolSearch} onChange={e=>setToolSearch(e.target.value)} placeholder="Search tools, reports or actions…" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"/>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openTool(tools[0])} aria-label="Create new PDF" className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-200 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm sm:font-semibold"><span className="text-lg leading-none sm:hidden">+</span><span className="hidden sm:inline">+ New PDF</span></button>
                <a href="/auth" className="hidden rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex">Sign in</a>
              </div>
            </div>
          </header>

          <div id="dashboard" className="mx-auto max-w-[1500px] px-4 pb-28 pt-5 sm:px-5 sm:py-7 md:px-8 md:py-9">
            <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">PDFMate Dashboard</div>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">Good to see you.</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Manage PDF work, launch tools and keep your most-used actions one click away.</p>
              </div>
              <button onClick={() => openTool(tools[0])} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 sm:w-auto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg><span>Upload & start</span></button>
            </div>

            <section className="mt-5 grid grid-cols-2 gap-3 sm:mt-7 sm:gap-4 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">AVAILABLE TOOLS</span><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg></span></div><div className="mt-3 text-2xl font-extrabold sm:mt-4 sm:text-3xl">{tools.filter(t=>t.available).length}</div><div className="mt-1 text-xs text-slate-500">PDF operations ready</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">RECENT TOOLS</span><span className="rounded-lg bg-amber-50 p-2 text-amber-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg></span></div><div className="mt-4 text-3xl font-extrabold">{recentTools.length}</div><div className="mt-1 text-xs text-slate-500">Saved on this device</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">CLOUD FILES</span><span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg></span></div><div className="mt-4 text-3xl font-extrabold">{cloudDocs.length}</div><div className="mt-1 text-xs text-slate-500">Private files available</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">PRIVACY MODE</span><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></svg></span></div><div className="mt-4 text-xl font-extrabold">Local-first</div><div className="mt-1 text-xs text-slate-500">Cloud is always opt-in</div></div>
            </section>

            <section className="mt-5 grid gap-4 sm:mt-7 sm:gap-6 xl:grid-cols-[1.55fr_.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Quick actions</h2><p className="mt-1 text-xs text-slate-500">Most common PDF workflows</p></div><a href="#tools" className="text-xs font-bold text-violet-600">View all tools →</a></div>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3 lg:grid-cols-3">
                  {tools.slice(0,6).map((tool,i)=><button key={tool.id} onClick={()=>openTool(tool)} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-violet-600 group-hover:bg-violet-100">{String(i+1).padStart(2,"0")}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{tool.name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{tool.description.split(".")[0]}</span></span></button>)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">My favourites</h2><p className="mt-1 text-xs text-slate-500">Your recent PDF actions</p></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg></div>
                <div className="mt-5 space-y-2">{recentTools.slice(0,6).map((name,i)=><button key={name} onClick={()=>{const t=tools.find(x=>x.name===name);if(t)openTool(t)}} className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-left text-sm font-medium hover:bg-violet-50"><span className="truncate">{name}</span><span className="text-violet-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span></button>)}{!recentTools.length&&<div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">Open a tool and it will appear here.</div>}</div>
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-7 sm:p-6" id="tools">
              <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">PDF TOOLKIT</div><h2 className="mt-1 text-2xl font-extrabold">All tools</h2><p className="mt-1 text-sm text-slate-500">Choose an operation and work directly in the PDF workspace.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">{visibleTools.length} {visibleTools.length===1?"tool":"tools"}</span></div>
              <div className="mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Tool categories">{toolCategories.map(category=><button key={category} type="button" role="tab" aria-selected={toolCategory===category} onClick={()=>setToolCategory(category)} className={"shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition "+(toolCategory===category?"border-violet-600 bg-violet-600 text-white":"border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50")}>{category}</button>)}</div><div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {visibleTools.map(tool=><button key={tool.id} onClick={()=>tool.available&&openTool(tool)} disabled={!tool.available} className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md disabled:cursor-default disabled:opacity-50"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-xs font-extrabold text-violet-600">PDF</span><span className="pt-2 text-slate-300 transition group-hover:text-violet-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span></div><h3 className="mt-4 text-sm font-bold">{tool.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{tool.description}</p></button>)}
              </div>
            </section>

            <section id="cloud" className="mt-5 grid gap-4 sm:mt-7 sm:gap-6 xl:grid-cols-[1.2fr_.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">My documents</h2><p className="mt-1 text-xs text-slate-500">Private cloud files saved by you</p></div><button onClick={loadCloudDocs} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">{cloudLoading?"Loading…":"Refresh"}</button></div>
                <div className="mt-5 space-y-2">{cloudDocs.slice(0,8).map(doc=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{doc.name}</div><div className="text-[11px] text-slate-400">{Math.max(1,Math.round(doc.size_bytes/1024))} KB</div></div><div className="flex gap-2"><button onClick={()=>downloadCloudDocument(doc.id).catch(e=>setStatus(e instanceof Error?e.message:"Download failed."))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-600">Open</button><button onClick={()=>deleteCloudDocument(doc.id).catch(e=>setStatus(e instanceof Error?e.message:"Delete failed."))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-500">Delete</button></div></div>)}{!cloudDocs.length&&!cloudLoading&&<div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No cloud files yet. Sign in and save a document from any tool.</div>}</div>
              </div>
              <div id="workflow" className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6"><div className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">WORKFLOW</div><h2 className="mt-2 text-xl font-bold">Simple, controlled PDF flow</h2><div className="mt-6 space-y-4">{["Choose a tool","Process in the browser","Download or save privately"].map((x,i)=><div key={x} className="flex gap-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">{String(i+1).padStart(2,"0")}</div><div><div className="text-sm font-semibold">{x}</div><div className="mt-1 text-xs leading-5 text-slate-400">No unnecessary uploads for browser-supported operations.</div></div></div>)}</div></div>
            </section>
          </div>
          <nav aria-label="Mobile navigation" className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
              <a href="#dashboard" className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold text-violet-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>Home</a>
              <a href="#tools" className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-slate-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>Tools</a>
              <a href="#cloud" className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-slate-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 12a8 8 0 0 1 15.5-2A5 5 0 0 1 18 20H7a5 5 0 0 1-3-8z"/></svg>Cloud</a>
              <a href="/auth" className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-slate-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></svg>Account</a>
            </div>
          </nav>
          <footer id="privacy" className="border-t border-slate-200 bg-white px-4 py-7 pb-28 text-center text-xs text-slate-400 md:px-8 md:pb-7">PDFMate · Privacy-first PDF workspace · Browser-first processing</footer>
        </div>
      </div>
      {active && <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/80 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) closeTool(); }}>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={active.id === "images" ? "image/png,image/jpeg" : active.id === "office" ? ".doc,.docx,.xls,.xlsx,.ppt,.pptx" : ".pdf,application/pdf"} multiple={active.id === "merge" || active.id === "images"} onChange={handleFiles}/>
        <div className="w-full max-w-xl rounded-t-3xl border border-zinc-800 bg-zinc-950 p-4 pb-6 shadow-2xl sm:my-6 sm:rounded-3xl sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{active.name}</h2><p className="mt-1 text-sm text-zinc-500">{active.description}</p></div><button type="button" onClick={closeTool} aria-label="Close PDF tool" className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-900">✕</button></div>
          {result ? <div className="mt-5 space-y-4"><div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5"><div className="text-xs font-bold uppercase tracking-wider text-emerald-300">Result ready</div><h3 className="mt-2 text-lg font-semibold">{result.name}</h3><p className="mt-1 text-sm text-zinc-400">Your file was created successfully. Preview it below when supported, or download it to continue.</p></div>{result.preview&&<iframe title="PDF result preview" src={resultUrl} className="h-[55vh] min-h-72 w-full rounded-xl border border-zinc-800 bg-white"/>}<div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" onClick={()=>{const a=document.createElement("a");a.href=resultUrl;a.download=result.name;a.click();}} className="rounded-xl bg-violet-500 px-4 py-3 font-semibold">Download result</button><button type="button" onClick={()=>{if(resultUrl)URL.revokeObjectURL(resultUrl);setResult(null);setResultUrl("");}} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm">Back to edit</button><button type="button" onClick={()=>{if(resultUrl)URL.revokeObjectURL(resultUrl);setResult(null);setResultUrl("");setFiles([]);setStatus("");requestAnimationFrame(()=>{if(input.current){input.current.value="";input.current.click();}});}} className="rounded-xl border border-violet-500/30 px-4 py-3 text-sm text-violet-300">Process another</button></div><p className="text-center text-xs text-zinc-600">Nothing is downloaded until you tap Download result.</p></div> : null}
          {!result && <>
          <button onClick={() => {if(input.current){input.current.value="";input.current.click();}}} className="mt-6 w-full rounded-2xl border border-dashed border-zinc-700 px-5 py-9 text-sm hover:border-violet-400">{files.length ? String(files.length) + " file(s) selected — choose again" : "Choose files"}</button>
          {files.length > 0 && <div className="mt-3 max-h-24 overflow-auto rounded-xl bg-zinc-900 p-3 text-sm text-zinc-400">{files.map(f => <div key={f.name + f.size} className="truncate">{f.name}</div>)}</div>}
           {files.length > 0 && <button type="button" disabled={cloudSaving} onClick={() => saveCloudDocument(files[0]).catch(e => setStatus(e instanceof Error ? e.message : "Cloud save failed."))} className="mt-3 w-full rounded-xl border border-violet-500/30 px-4 py-3 text-sm text-violet-300 disabled:opacity-50">{cloudSaving ? "Saving to cloud…" : "Save original to private cloud"}</button>}
          {active.id === "reorder" && files[0] && <button onClick={() => loadOrganizer(files[0])} className="mt-4 w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm hover:border-violet-500">Preview & arrange pages</button>}
          {active.id === "reorder" && order.length > 0 && <div className="mt-4 grid max-h-72 grid-cols-3 gap-3 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:grid-cols-4">
             {order.map((pageNumber) => {
               const preview = previews.find((item) => item.index === pageNumber);
               return (
                 <div
                   key={pageNumber}
                   draggable
                   onDragStart={() => setDragPage(pageNumber)}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={() => {
                     if (dragPage !== null) movePage(dragPage, pageNumber);
                     setDragPage(null);
                   }}
                   className="cursor-grab rounded-lg border border-zinc-800 bg-zinc-950 p-2 active:cursor-grabbing"
                 >
                   <div className="aspect-[3/4] overflow-hidden rounded bg-white">
                     {preview && <img src={preview.url} alt={"Page " + pageNumber} className="h-full w-full object-contain" />}
                   </div>
                   <div className="pt-2 text-center text-xs text-zinc-400">Page {pageNumber}</div>
                 </div>
               );
             })}
          </div>}
          {active.id === "reorder" && order.length > 0 && <button onClick={() => setSpec(order.join(","))} className="mt-3 w-full rounded-xl border border-violet-500/40 px-4 py-2 text-sm text-violet-300">Use this page order</button>}
          {active.needsSpec && <><label className="mt-5 block text-sm text-zinc-400">{active.id === "sign" ? "Pages to sign (blank = every page)" : "Pages"}</label><input value={spec} onChange={e => setSpec(e.target.value)} placeholder="Example: 1,3-5,8" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/></>}
          {active.id === "crop" && <><label className="mt-5 block text-sm text-zinc-400">Margin to remove (points)</label><input value={spec} onChange={e => setSpec(e.target.value)} inputMode="numeric" placeholder="24" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/></>}
          {active.id === "rotate" && <><label className="mt-5 block text-sm text-zinc-400">Rotation</label><select value={angle} onChange={e => setAngle(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></>}
          {active.action === "redact" && <div className="mt-5 space-y-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
  <p className="text-sm text-zinc-400">Place a black redaction block over sensitive content. PDFMate rasterizes the page so covered source text is not retained as selectable text.</p>
  <div className="grid grid-cols-2 gap-3"><input type="number" value={editPage} onChange={e=>setEditPage(Number(e.target.value)||1)} placeholder="Page" className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/><input type="number" value={editX} onChange={e=>setEditX(Number(e.target.value)||0)} placeholder="X" className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/></div>
  <div className="grid grid-cols-3 gap-3"><input type="number" value={editY} onChange={e=>setEditY(Number(e.target.value)||0)} placeholder="Y" className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/><input type="number" value={redactWidth} onChange={e=>setRedactWidth(Number(e.target.value)||1)} placeholder="Width" className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/><input type="number" value={redactHeight} onChange={e=>setRedactHeight(Number(e.target.value)||1)} placeholder="Height" className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/></div>
  <p className="text-xs text-red-300">Use the visual editor coordinates or PDF-point measurements. Verify the exported PDF before sharing.</p>
</div>}
{active.action === "protect" && <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"><p className="text-sm text-zinc-300">Secure password encryption runs server-side.</p><input type="password" value={protectPassword} onChange={e=>setProtectPassword(e.target.value)} placeholder="Minimum 8 characters" className="mt-4 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/></div>}{active.action === "auto" && <div className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
  <p className="text-sm text-zinc-400">Auto Mode inspects the document locally and recommends the next PDF operation.</p>
  {autoReport && <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="text-zinc-500">Pages</div><div className="mt-1 text-lg font-semibold">{autoReport.pages}</div></div>
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="text-zinc-500">Forms</div><div className="mt-1 text-lg font-semibold">{autoReport.formFields}</div></div>
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="text-zinc-500">Portrait</div><div className="mt-1 text-lg font-semibold">{autoReport.portrait}</div></div>
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="text-zinc-500">Landscape</div><div className="mt-1 text-lg font-semibold">{autoReport.landscape}</div></div>
  </div>}
  {autoReport && <div className="mt-4 rounded-xl border border-violet-500/20 bg-zinc-950 p-4"><div className="text-xs uppercase tracking-wider text-violet-300">Recommended next step</div><div className="mt-2 font-medium">{autoReport.recommendation}</div><div className="mt-3 flex flex-wrap gap-2">{(autoReport.formFields>0 ? ["Fill PDF Forms"] : /OCR PDF/.test(autoReport.recommendation) ? ["OCR PDF"] : ["Optimize PDF","Edit PDF"]).map(name=><button key={name} type="button" onClick={()=>{const next=tools.find(t=>t.name===name); if(next) openTool(next);}} className="rounded-lg border border-violet-500/30 px-3 py-2 text-xs text-violet-300 hover:border-violet-400">{name}</button>)}</div></div>}
</div>}
{active.id === "ocr" && <div className="mt-5"><p className="text-sm text-zinc-400">OCR runs in your browser. Up to 20 pages are processed per run.</p><select value={ocrLanguage} onChange={e=>setOcrLanguage(e.target.value)} className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm"><option value="eng">English</option><option value="eng+hin">English + Hindi</option></select><label className="mt-3 flex items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={ocrSearchable} onChange={e=>setOcrSearchable(e.target.checked)}/> Create searchable OCR PDF</label><div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-violet-500 transition-all" style={{width: Math.round(ocrProgress*100)+"%"}} /></div>{ocrText && <textarea value={ocrText} readOnly className="mt-4 h-56 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300" />}</div>}{active.id === "forms" && <div className="mt-5">
<button type="button" onClick={async()=>{try{setStatus("Detecting form fields…");const fields=await getPdfFormFields(files[0]);setFormFields(fields);setFormValues(Object.fromEntries(fields.map(f=>[f.name,""])));setStatus(fields.length+" fillable field(s) detected.");}catch(e){setStatus(e instanceof Error?e.message:"Could not inspect PDF form.");}}} className="w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm hover:border-violet-500">Detect form fields</button>
<div className="mt-3 space-y-3">{formFields.map(field=><label key={field.name} className="block text-sm text-zinc-400">{field.name}{/CheckBox/i.test(field.type) ? <select value={formValues[field.name]||""} onChange={e=>setFormValues(v=>({...v,[field.name]:e.target.value}))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white"><option value="">Unchecked</option><option value="true">Checked</option></select> : <input value={formValues[field.name]||""} onChange={e=>setFormValues(v=>({...v,[field.name]:e.target.value}))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white" placeholder={field.type}/>}</label>)}</div>
</div>}{active.id === "edit" && <div className="mt-5 space-y-3">
<label className="block text-sm text-zinc-400">Edit type</label>
<select value={editType} onChange={e => setEditType(e.target.value as "text"|"highlight"|"rect"|"line"|"whiteout")} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="text">Add text</option><option value="highlight">Highlight</option><option value="rect">Rectangle</option><option value="line">Line</option><option value="whiteout">Whiteout</option></select>
<div className="grid grid-cols-2 gap-3"><input value={editPage} onChange={e => setEditPage(Number(e.target.value)||1)} type="number" min="1" placeholder="Page" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/>{editType === "text" && <input value={editText} onChange={e => setEditText(e.target.value)} placeholder="Text to add" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/>}</div>
<div className="grid grid-cols-2 gap-3"><input type="number" value={editX} onChange={e=>setEditX(Number(e.target.value)||0)} placeholder="X" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/><input type="number" value={editY} onChange={e=>setEditY(Number(e.target.value)||0)} placeholder="Y" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/></div><div className="grid grid-cols-2 gap-3"><input type="number" value={editW} onChange={e=>setEditW(Number(e.target.value)||1)} placeholder="Width" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/><input type="number" value={editH} onChange={e=>setEditH(Number(e.target.value)||1)} placeholder="Height" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"/></div><button type="button" onClick={async()=>{try{setStatus("Rendering editor preview…");const pages=await renderPdfPreviews(files[0],60);setPreviews(pages);setStatus("Click the page preview to place the annotation.");}catch(e){setStatus(e instanceof Error?e.message:"Could not render editor preview.");}}} className="w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm hover:border-violet-500">Load visual editor</button>{previews.filter(p=>p.index===editPage).map(p=><div key={p.index} className="relative block w-full overflow-hidden rounded-lg border border-zinc-700"><img src={p.url} alt={"Page "+p.index+" preview"} className="block w-full"/><div draggable onDragEnd={e=>{const box=(e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();const x=e.clientX-box.left;const y=e.clientY-box.top;const scale=.55;setEditX(Math.max(0,Math.round(x/scale-editW/2)));setEditY(Math.max(0,Math.round((box.height-y)/scale-editH/2)));}} style={{left:Math.max(0,editX*.55),top:Math.max(0,(p.height-editY-editH)*.55),width:Math.max(24,editW*.55),height:Math.max(18,editH*.55)}} className="absolute cursor-move rounded border-2 border-violet-400 bg-violet-400/20"><span className="absolute -right-1 -bottom-1 h-3 w-3 rounded-sm bg-violet-400"/></div><button type="button" aria-label="Set annotation position" onClick={e=>{const r=(e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();const scale=.55;setEditX(Math.round((e.clientX-r.left)/scale));setEditY(Math.round((r.height-(e.clientY-r.top))/scale));}} className="absolute inset-0 cursor-crosshair opacity-0"/></div>)}<p className="text-xs text-zinc-600">Click the preview to place the selected edit tool. Coordinates are stored in PDF points.</p>
</div>}{active.id === "resize" && <><label className="mt-5 block text-sm text-zinc-400">Target page size</label><select value={pageSize} onChange={e => setPageSize(e.target.value as "a4"|"letter"|"legal"|"a5")} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="a5">A5</option></select><p className="mt-2 text-xs text-zinc-600">Pages are proportionally fitted and centered on the selected size.</p></>}{active.id === "pdfimages" && <><label className="mt-5 block text-sm text-zinc-400">Image format</label><select value={imageFormat} onChange={e => setImageFormat(e.target.value as "png"|"jpeg")} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><option value="png">PNG</option><option value="jpeg">JPG</option></select></>}
          {active.id === "sign" && <div className="mt-5"><label className="block text-sm text-zinc-400">Draw your signature</label><canvas ref={canvas} width={900} height={260} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={stopDraw} onPointerCancel={stopDraw} className="mt-2 h-40 w-full touch-none rounded-xl border border-zinc-700 bg-white"/><button type="button" onClick={() => { const c=canvas.current,ctx=c?.getContext("2d"); if(c&&ctx){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);setSignatureReady(false);} }} className="mt-2 text-sm text-zinc-500 hover:text-zinc-300">Clear signature</button></div>}
          {active.id === "ai" && <><label className="mt-5 block text-sm text-zinc-400">Ask your PDF</label><textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Summarize this document, find the key dates, explain section 3…" className="mt-2 min-h-28 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/>{active.id === "ai" && <div className="mt-3 flex flex-wrap gap-2">{["Summarize the document in 5 bullet points.","Extract all important dates, deadlines and amounts.","List the key sections and explain each briefly."].map(q=><button key={q} type="button" onClick={()=>setAiPrompt(q)} className="rounded-full border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:border-violet-500 hover:text-violet-300">{q.split(".")[0]}</button>)}</div>}{aiAnswer && <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm leading-6 text-zinc-300 whitespace-pre-wrap">{aiAnswer}</div>}</>}
          {active.needsText && <><label className="mt-5 block text-sm text-zinc-400">Watermark text</label><input value={text} onChange={e => setText(e.target.value)} placeholder="CONFIDENTIAL" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-violet-500"/></>}
          <button disabled={!files.length || busy} onClick={run} className="mt-6 w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold disabled:opacity-40">{busy ? "Processing…" : active.id === "ai" ? "Ask PDF" : "Create result"}</button>
          {status && <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-center text-sm text-zinc-400">{status}</p>}
          <div className="mt-5 flex items-center justify-between border-t border-zinc-900 pt-4"><button type="button" onClick={closeTool} className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 hover:text-white">← Back to tools</button><span className="text-xs text-zinc-600">Step: choose → configure → result</span></div>
          <p className="mt-3 text-center text-xs text-zinc-600">Browser-supported operations run locally. Password encryption and advanced optimization/conversion use the secure server worker.</p>
          </>}
        </div>
      </div>
    </main>
  );
}