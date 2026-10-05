import test from "node:test";
import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {existsSync, readFileSync, writeFileSync, mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {PDFDocument} from "pdf-lib";

const root = new URL("..", import.meta.url).pathname;
const ready = existsSync(path.join(root, "worker/node_modules/busboy"));
const hasQpdf = spawnSync("qpdf", ["--version"]).status === 0;
const TOKEN = "test-token-123";
const opts = {skip: ready ? false : "run `npm ci --prefix worker` first"};

async function pdfBytes() {
  const d = await PDFDocument.create(); d.addPage([200, 200]); return Buffer.from(await d.save());
}
function startWorker(env = {}) {
  return new Promise((resolve, reject) => {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [path.join(root, "worker/server.mjs")], {env: {...process.env, NODE_ENV: "test", PORT: String(port), PDF_WORKER_TOKEN: TOKEN, ...env}, stdio: ["ignore", "pipe", "pipe"]});
    child.stdout.on("data", d => { if (String(d).includes("listening")) resolve({child, url: "http://127.0.0.1:" + port}); });
    child.on("error", reject);
    setTimeout(() => reject(new Error("worker did not start")), 8000);
  });
}
const form = (fields, file, name = "input.pdf") => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (file) f.append("file", new Blob([file]), name);
  return f;
};
const auth = {Authorization: "Bearer " + TOKEN};

test("worker: health, auth, method and validation", opts, async () => {
  const {child, url} = await startWorker();
  try {
    assert.equal((await fetch(url + "/healthz")).status, 200);
    assert.equal((await fetch(url, {method: "GET"})).status, 405);
    assert.equal((await fetch(url, {method: "POST", body: form({action: "compress"}, await pdfBytes())})).status, 401);
    assert.equal((await fetch(url, {method: "POST", headers: {Authorization: "Bearer wrong"}, body: form({action: "compress"}, await pdfBytes())})).status, 401);
    assert.equal((await fetch(url, {method: "POST", headers: auth, body: form({action: "compress"})})).status, 400);
    assert.equal((await fetch(url, {method: "POST", headers: auth, body: form({action: "rm -rf"}, await pdfBytes())})).status, 400);
    assert.equal((await fetch(url, {method: "POST", headers: auth, body: form({action: "compress"}, Buffer.from("not a pdf"))})).status, 422);
    assert.equal((await fetch(url, {method: "POST", headers: auth, body: form({action: "protect", password: "short"}, await pdfBytes())})).status, hasQpdf ? 400 : 422);
  } finally { child.kill(); }
});

test("worker: refuses to start in production without a token", opts, () => {
  const r = spawnSync(process.execPath, [path.join(root, "worker/server.mjs")], {env: {...process.env, NODE_ENV: "production", PDF_WORKER_TOKEN: ""}, timeout: 5000});
  assert.notEqual(r.status, 0);
});

test("worker: rejects oversized files", opts, async () => {
  const {child, url} = await startWorker({MAX_FILE_BYTES: "1000"});
  try {
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5000, 65)]);
    assert.equal((await fetch(url, {method: "POST", headers: auth, body: form({action: "compress"}, big)})).status, 413);
  } finally { child.kill(); }
});

test("worker: protect requires the password to open the file", {skip: ready && hasQpdf ? false : "needs worker deps and qpdf"}, async () => {
  const {child, url} = await startWorker();
  const pw = 'p@ss w0rd "quoted" -dash';
  try {
    const res = await fetch(url, {method: "POST", headers: auth, body: form({action: "protect", password: pw}, await pdfBytes())});
    assert.equal(res.status, 200);
    const out = path.join(mkdtempSync(path.join(tmpdir(), "pm-")), "p.pdf");
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    assert.notEqual(spawnSync("qpdf", ["--check", out]).status, 0, "must NOT open without a password");
    assert.equal(spawnSync("qpdf", ["--password=" + pw, "--check", out]).status, 0, "must open with the password");
  } finally { child.kill(); }
});

test("worker: compress returns a valid PDF and errors never echo the password", {skip: ready && hasQpdf ? false : "needs worker deps and qpdf"}, async () => {
  const {child, url} = await startWorker();
  try {
    const res = await fetch(url, {method: "POST", headers: auth, body: form({action: "compress"}, await pdfBytes())});
    assert.equal(res.status, 200);
    assert.match(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString(), /%PDF-/);
    const bad = await fetch(url, {method: "POST", headers: auth, body: form({action: "protect", password: "SuperSecret-123"}, Buffer.from("%PDF-1.4 garbage"))});
    assert.equal(bad.status, 422);
    assert.doesNotMatch(await bad.text(), /SuperSecret/);
  } finally { child.kill(); }
});

test("client sources keep security-critical behaviour", () => {
  const sw = readFileSync(path.join(root, "public/sw.js"), "utf8");
  assert.match(sw, /startsWith\("\/api\/"\)/, "service worker must skip /api");
  const ai = readFileSync(path.join(root, "app/api/ai/route.ts"), "utf8");
  assert.match(ai, /OPENROUTER_ALLOWED_MODELS/, "client-chosen models must be allowlisted");
});

// Contract test: mirrors lib/upload-token.ts (exp.nonce.action.sig, HMAC key derived from the shared secret).
function mint(action, {ttl = 120, secret = TOKEN, nonce = crypto.randomBytes(12).toString("hex")} = {}) {
  const key = crypto.createHmac("sha256", secret).update("pdfmate-upload-v1").digest();
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return exp + "." + nonce + "." + action + "." + crypto.createHmac("sha256", key).update(exp + "." + nonce + "." + action).digest("hex");
}

test("worker: direct browser uploads use signed single-use tokens and CORS", {skip: ready && hasQpdf ? false : "needs worker deps and qpdf"}, async () => {
  const ORIGIN = "https://app.example.com";
  const {child, url} = await startWorker({ALLOWED_ORIGINS: ORIGIN});
  const post = (token, action = "compress", origin = ORIGIN) => pdfBytes().then(b => fetch(url, {method: "POST", headers: {"X-Upload-Token": token, Origin: origin}, body: form({action}, b)}));
  try {
    const pre = await fetch(url, {method: "OPTIONS", headers: {Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-upload-token"}});
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
    assert.match(pre.headers.get("access-control-allow-headers"), /X-Upload-Token/i);
    assert.equal((await fetch(url, {method: "OPTIONS", headers: {Origin: "https://evil.example"}})).status, 403);

    const good = mint("compress");
    const ok = await post(good);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal((await post(good)).status, 401, "token must be single-use");
    assert.equal((await post(mint("compress", {ttl: -5}))).status, 401, "expired token");
    assert.equal((await post(mint("compress", {secret: "other-secret"}))).status, 401, "forged token");
    assert.equal((await post(mint("compress"), "protect")).status, 403, "token bound to its action");
    const tampered = mint("compress").replace(/.$/, c => (c === "0" ? "1" : "0"));
    assert.equal((await post(tampered)).status, 401, "tampered signature");
    assert.equal((await post("garbage")).status, 401);
    const evil = await post(mint("compress"), "compress", "https://evil.example");
    assert.equal(evil.headers.get("access-control-allow-origin"), null, "no CORS header for unlisted origins");
  } finally { child.kill(); }
});
