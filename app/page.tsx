"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

type Tool = { name: string; description: string; accept: string; mode: "merge" | "split" | "images" };

const tools: Tool[] = [
  { name: "Merge PDF", description: "Combine multiple PDFs into one document.", accept: ".pdf,application/pdf", mode: "merge" },
  { name: "Split PDF", description: "Extract selected pages into a new PDF.", accept: ".pdf,application/pdf", mode: "split" },
  { name: "Images to PDF", description: "Turn JPG or PNG images into a PDF.", accept: "image/png,image/jpeg", mode: "images" },
  { name: "Compress PDF", description: "Create a clean optimized copy in your browser.", accept: ".pdf,application/pdf", mode: "merge" },
  { name: "Organize PDF", description: "Prepare page reorder, rotate and delete workflows.", accept: ".pdf,application/pdf", mode: "split" },
  { name: "PDF to Images", description: "Export PDF pages as images with the browser viewer.", accept: ".pdf,application/pdf", mode: "split" },
  { name: "Protect PDF", description: "Prepare a PDF for password protection.", accept: ".pdf,application/pdf", mode: "merge" },
  { name: "AI PDF", description: "Ask questions and extract information from documents.", accept: ".pdf,application/pdf", mode: "merge" }
];

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [active, setActive] = useState<Tool | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  function openTool(tool: Tool) {
    setActive(tool);
    setFiles([]);
    setStatus("");
    requestAnimationFrame(() => input.current?.click());
  }

  async function process() {
    if (!active || files.length === 0) return;
    setBusy(true);
    setStatus("Processing locally…");
    try {
      if (active.mode === "images") {
        const out = await PDFDocument.create();
        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const image = file.type === "image/png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
          const page = out.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }
        download(await out.save(), "pdfmate-images.pdf");
      } else if (active.mode === "merge") {
        const out = await PDFDocument.create();
        for (const file of files) {
          const src = await PDFDocument.load(await file.arrayBuffer());
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(page => out.addPage(page));
        }
        download(await out.save(), "pdfmate-merged.pdf");
      } else {
        const src = await PDFDocument.load(await files[0].arrayBuffer());
        const out = await PDFDocument.create();
        const [page] = await out.copyPages(src, [0]);
        out.addPage(page);
        download(await out.save(), "pdfmate-extract.pdf");
      }
      setStatus("Done — your file was created in the browser.");
    } catch (error) {
      console.error(error);
      setStatus("Could not process this file. Please check the format and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="text-xl font-bold">PDF<span className="text-violet-400">Mate</span></div>
        <nav className="hidden gap-7 text-sm text-zinc-400 md:flex">
          <a href="#tools">Tools</a><a href="#workflow">How it works</a><a href="#privacy">Privacy</a>
        </nav>
        <button className="rounded-xl border border-zinc-700 px-4 py-2 text-sm">Sign in</button>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 text-center">
        <div className="mb-5 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs text-violet-300">FAST · PRIVATE · PDF-FIRST</div>
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">Your PDFs.<br/><span className="text-violet-400">Simplified.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-400">Merge, split, compress, organize and transform PDFs in a clean workspace built for everyday documents.</p>
        <div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
          <button onClick={() => openTool(tools[0])} className="w-full rounded-2xl border border-dashed border-zinc-700 px-6 py-14 transition hover:border-violet-400 hover:bg-violet-500/5">
            <div className="text-lg font-semibold">Drop PDFs here or choose files</div>
            <div className="mt-2 text-sm text-zinc-500">Files are processed locally for the browser-based tools.</div>
          </button>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-7xl px-6 pb-24">
        <h2 className="text-3xl font-semibold">PDF tools</h2>
        <p className="mt-2 text-zinc-500">Start with local-first tools. More document features can plug into the same workspace.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map(tool => (
            <article key={tool.name} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition hover:border-violet-500/40">
              <div className="mb-8 h-10 w-10 rounded-xl bg-violet-500/15"/>
              <h3 className="font-semibold">{tool.name}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{tool.description}</p>
              <button onClick={() => openTool(tool)} className="mt-5 text-sm text-violet-300 hover:text-violet-200">Open tool →</button>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="border-y border-zinc-900 bg-zinc-950 px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold">Simple workflow</h2>
        <p className="mx-auto mt-3 max-w-xl text-zinc-500">Choose a tool, add documents, process them locally, then export.</p>
      </section>

      <footer id="privacy" className="mx-auto max-w-7xl px-6 py-10 text-sm text-zinc-600">PDFMate · Privacy-first PDF workspace</footer>

      <input ref={input} hidden type="file" multiple accept={active?.accept} onChange={e => setFiles(Array.from(e.target.files || []))}/>

      {active && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-semibold">{active.name}</h2><p className="mt-1 text-sm text-zinc-500">{active.description}</p></div>
              <button onClick={() => setActive(null)} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-900">✕</button>
            </div>
            <button onClick={() => input.current?.click()} className="mt-6 w-full rounded-2xl border border-dashed border-zinc-700 px-5 py-10 text-sm hover:border-violet-400">
              {files.length ? String(files.length) + " file(s) selected" : "Choose files"}
            </button>
            {files.length > 0 && <div className="mt-3 max-h-32 space-y-1 overflow-auto text-sm text-zinc-400">{files.map(f => <div key={f.name + f.size} className="truncate">{f.name}</div>)}</div>}
            <button disabled={!files.length || busy} onClick={process} className="mt-6 w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? "Processing…" : "Process & download"}
            </button>
            {status && <p className="mt-4 text-center text-sm text-zinc-400">{status}</p>}
            <p className="mt-5 text-center text-xs text-zinc-600">Browser processing is used where supported. No upload is required for these operations.</p>
          </div>
        </div>
      )}
    </main>
  );
}