import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import Busboy from "busboy";

const exec = promisify(execFile);
const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.PDF_WORKER_TOKEN || "";
const MAX_BYTES = Number(process.env.MAX_FILE_BYTES || 50 * 1024 * 1024);
const MAX_JOBS = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 2));
const MAX_QUEUE = 20;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
const UPLOAD_KEY = TOKEN ? crypto.createHmac("sha256", TOKEN).update("pdfmate-upload-v1").digest() : null;
const usedNonces = new Map();
const OFFICE_EXT = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf"]);

if (process.env.NODE_ENV === "production" && !TOKEN) {
  console.error("PDF_WORKER_TOKEN is required when NODE_ENV=production.");
  process.exit(1);
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, {"Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...headers});
  res.end(body);
}
const json = (res, status, obj) => send(res, status, "application/json", JSON.stringify(obj));

const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

// Short-lived, action-bound, single-use browser token minted by the web app (lib/upload-token.ts): exp.nonce.action.sig
function verifyUploadToken(raw) {
  const p = String(raw || "").split(".");
  if (p.length !== 4 || !UPLOAD_KEY) return null;
  const [exp, nonce, action, sig] = p, now = Date.now() / 1000;
  if (!/^\d+$/.test(exp) || Number(exp) < now || !/^[a-f0-9]{24}$/.test(nonce)) return null;
  const want = crypto.createHmac("sha256", UPLOAD_KEY).update(exp + "." + nonce + "." + action).digest("hex");
  if (!safeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  for (const [n, e] of usedNonces) if (e < now) usedNonces.delete(n);
  if (usedNonces.has(nonce)) return null;
  usedNonces.set(nonce, Number(exp));
  return {action};
}
/** Returns null (denied) or {action}: action is null for the server-to-server bearer token, or the single action a browser token allows. */
function authorize(req) {
  if (!TOKEN) return {action: null};
  if (safeEqual(Buffer.from(req.headers.authorization || ""), Buffer.from("Bearer " + TOKEN))) return {action: null};
  return verifyUploadToken(req.headers["x-upload-token"]);
}
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  return true;
}

let active = 0;
const waiters = [];
async function acquire() {
  if (active < MAX_JOBS) { active++; return; }
  if (waiters.length >= MAX_QUEUE) throw new HttpError(503, "The worker is busy. Try again shortly.");
  await new Promise(resolve => waiters.push(resolve));
}
function release() { const next = waiters.shift(); if (next) next(); else active--; }

function parse(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try { bb = Busboy({headers: req.headers, limits: {fileSize: MAX_BYTES, files: 1, fields: 8}}); }
    catch { return reject(new HttpError(400, "Expected multipart form data.")); }
    let file = null, password = "", action = "";
    const fail = e => { req.unpipe(bb); req.resume(); reject(e); };
    bb.on("file", (name, stream, info) => {
      const chunks = []; let truncated = false;
      stream.on("data", b => chunks.push(b));
      stream.on("limit", () => { truncated = true; fail(new HttpError(413, "File is too large.")); });
      stream.on("end", () => { if (name === "file" && !truncated) file = {buffer: Buffer.concat(chunks), name: info.filename || "input"}; });
    });
    bb.on("field", (name, value) => { if (name === "password") password = value; if (name === "action") action = value; });
    bb.on("error", () => fail(new HttpError(400, "Malformed upload.")));
    bb.on("finish", () => resolve({file, password, action}));
    req.pipe(bb);
  });
}

const looksPdf = b => b.subarray(0, 1024).includes("%PDF-");
const looksOffice = (b, ext) => ext === ".rtf" ? b.subarray(0, 5).toString() === "{\\rtf"
  : (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0);

async function run(cmd, args, timeout) {
  try {
    await exec(cmd, args, {timeout, maxBuffer: 1024 * 1024, env: {...process.env, HOME: process.env.HOME || os.tmpdir()}});
  } catch (e) {
    if (e.code === 3) return; // qpdf exit 3 = succeeded with warnings
    console.error(cmd + " failed (code " + e.code + "): " + String(e.stderr || "").slice(0, 300)); // never log e.message: it contains argv
    throw e;
  }
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, {ok: true});
  const corsOk = applyCors(req, res);
  if (req.method === "OPTIONS") {
    if (!corsOk) return send(res, 403, "text/plain", "Forbidden");
    return send(res, 204, "text/plain", "", {"Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "X-Upload-Token, Content-Type", "Access-Control-Max-Age": "600"});
  }
  if (req.method !== "POST") return send(res, 405, "text/plain", "Method Not Allowed", {Allow: "POST"});
  const grant = authorize(req);
  if (!grant) return json(res, 401, {error: "Unauthorized"});

  await acquire();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pdfmate-"));
  try {
    const {file, password, action} = await parse(req);
    if (!file || !file.buffer.length) throw new HttpError(400, "file is required");
    if (action !== "protect" && action !== "compress" && action !== "office-to-pdf") throw new HttpError(400, "Unsupported worker action.");
    if (grant.action && grant.action !== action) throw new HttpError(403, "Token is not valid for this action.");

    const output = path.join(tmp, "output.pdf");
    let filename;
    if (action === "office-to-pdf") {
      const ext = path.extname(file.name).toLowerCase();
      if (!OFFICE_EXT.has(ext) || !looksOffice(file.buffer, ext)) throw new HttpError(422, "Unsupported or invalid Office document.");
      const input = path.join(tmp, "input" + ext), outDir = path.join(tmp, "office-out");
      await fs.writeFile(input, file.buffer); await fs.mkdir(outDir);
      try {
        await run("libreoffice", ["-env:UserInstallation=file://" + path.join(tmp, "lo-profile"), "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", outDir, input], 120000);
        await fs.copyFile(path.join(outDir, "input.pdf"), output);
      } catch { throw new HttpError(422, "The document could not be converted."); }
      filename = "pdfmate-converted.pdf";
    } else {
      if (!looksPdf(file.buffer)) throw new HttpError(422, "The file is not a valid PDF.");
      const input = path.join(tmp, "input.pdf");
      await fs.writeFile(input, file.buffer);
      try { await run("qpdf", ["--check", input], 60000); } catch { throw new HttpError(422, "The PDF is damaged or password-protected."); }
      if (action === "protect") {
        if (password.length < 8 || password.length > 128) throw new HttpError(400, "password must be 8-128 characters");
        if (/[\r\n\0]/.test(password)) throw new HttpError(400, "password contains unsupported characters");
        // Both user and owner password are set so the file cannot be opened without it. Passed via an args file, never argv.
        const argsFile = path.join(tmp, "qpdf.args");
        await fs.writeFile(argsFile, ["--encrypt", "--user-password=" + password, "--owner-password=" + password, "--bits=256", "--", input, output].join("\n") + "\n", {mode: 0o600});
        try { await run("qpdf", ["@" + argsFile], 60000); } catch { throw new HttpError(422, "The PDF could not be protected."); }
        filename = "pdfmate-protected.pdf";
      } else {
        try { await run("qpdf", ["--stream-data=compress", "--object-streams=generate", "--optimize-images", input, output], 90000); }
        catch { throw new HttpError(422, "The PDF could not be optimized."); }
        filename = "pdfmate-optimized.pdf";
      }
    }
    send(res, 200, "application/pdf", await fs.readFile(output), {"Content-Disposition": 'attachment; filename="' + filename + '"'});
  } catch (e) {
    if (e instanceof HttpError) json(res, e.status, {error: e.message});
    else { console.error("worker error:", e && e.code); json(res, 500, {error: "Worker error."}); }
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
    release();
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => { if (!res.headersSent) json(res, 500, {error: "Worker error."}); else res.end(); });
});
server.headersTimeout = 20000;
server.requestTimeout = 150000;
server.listen(PORT, "0.0.0.0", () => console.log("PDFMate worker listening on " + PORT));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
