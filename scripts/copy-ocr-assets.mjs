// Copies the OCR engine and language data from node_modules into public/ocr so OCR runs fully self-hosted
// (no cdn.jsdelivr.net requests). Runs before dev/build; output is git-ignored.
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "ocr");
const nm = path.join(root, "node_modules");
const core = path.join(nm, "tesseract.js-core");
const needed = [
  [path.join(nm, "tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  ...["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"].map(n => [path.join(core, n + ".wasm.js"), path.join("core", n + ".wasm.js")]),
  ...["eng", "hin"].map(l => [path.join(nm, "@tesseract.js-data", l, "4.0.0_best_int", l + ".traineddata.gz"), path.join("lang", l + ".traineddata.gz")])
];

rmSync(out, { recursive: true, force: true });
for (const [src, rel] of needed) {
  if (!existsSync(src)) { console.error("Missing OCR asset: " + src + " (run npm ci)"); process.exit(1); }
  const dest = path.join(out, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest);
}
// pdf.js worker (self-hosted so PDF rendering/reading works without a CDN and under a strict CSP)
const pdfjsOut = path.join(root, "public", "pdfjs");
rmSync(pdfjsOut, { recursive: true, force: true });
mkdirSync(pdfjsOut, { recursive: true });
cpSync(path.join(nm, "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"), path.join(pdfjsOut, "pdf.worker.min.mjs"));
console.log("OCR assets copied to public/ocr (" + needed.length + " files) and pdf.js worker to public/pdfjs");
