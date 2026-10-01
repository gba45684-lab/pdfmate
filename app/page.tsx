"use client";
import { useRef, useState } from "react";

const tools = [
  ["Merge PDF","Combine files in the order you choose."],
  ["Split PDF","Extract pages or divide a document."],
  ["Compress PDF","Reduce file size while keeping quality."],
  ["Organize PDF","Reorder, rotate, delete and extract pages."],
  ["PDF to Images","Turn pages into PNG or JPG files."],
  ["Images to PDF","Create a PDF from images."],
  ["Protect PDF","Add password protection and permissions."],
  ["AI PDF","Ask questions, summarize and extract information."]
];

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
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
          <button onClick={() => input.current?.click()} className="w-full rounded-2xl border border-dashed border-zinc-700 px-6 py-14 transition hover:border-violet-400 hover:bg-violet-500/5">
            <div className="text-lg font-semibold">{files.length ? files.length + " file(s) selected" : "Drop PDFs here or choose files"}</div>
            <div className="mt-2 text-sm text-zinc-500">Your files stay in your browser for local-first tools.</div>
          </button>
          <input ref={input} hidden type="file" multiple accept=".pdf,application/pdf" onChange={e => setFiles(Array.from(e.target.files || []))}/>
        </div>
      </section>
      <section id="tools" className="mx-auto max-w-7xl px-6 pb-24">
        <h2 className="text-3xl font-semibold">Everything you need for PDFs</h2>
        <p className="mt-2 text-zinc-500">Start with focused tools. Grow into a complete document workspace.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map(([name, desc]) => <article key={name} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 hover:border-zinc-700"><div className="mb-8 h-10 w-10 rounded-xl bg-violet-500/15"/><h3 className="font-semibold">{name}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{desc}</p><button className="mt-5 text-sm text-violet-300">Open tool →</button></article>)}
        </div>
      </section>
      <section id="workflow" className="border-y border-zinc-900 bg-zinc-950 px-6 py-20 text-center"><h2 className="text-3xl font-semibold">Simple workflow</h2><p className="mx-auto mt-3 max-w-xl text-zinc-500">Choose a tool, add your documents, make changes, then export.</p></section>
      <footer id="privacy" className="mx-auto max-w-7xl px-6 py-10 text-sm text-zinc-600">PDFMate · Privacy-first PDF workspace</footer>
    </main>
  );
}