import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = f => readFileSync(path.join(root, f), "utf8");
const libFiles = readdirSync(path.join(root, "lib")).filter(f => f.endsWith(".ts"));

test("tool dialog renders the file input that 'Choose files' clicks (regression: input was missing entirely)", () => {
  const page = read("app/page.tsx");
  assert.match(page, /<input ref=\{input\} type="file"/);
  assert.match(page, /onChange=\{e => \{ onPicked\(e\.target\.files\)/);
});

test("pdf.js is opened only through the self-hosted worker helper (regression: workerSrc missing, disableWorker ignored)", () => {
  for (const f of libFiles) {
    const src = read("lib/" + f);
    assert.doesNotMatch(src, /disableWorker/, f);
    if (f !== "pdfjs.ts") assert.doesNotMatch(src, /pdfjs\.getDocument|import\("pdfjs-dist/, f + " must use openPdfjsDocument");
  }
  assert.match(read("lib/pdfjs.ts"), /workerSrc = "\/pdfjs\/pdf\.worker\.min\.mjs"/);
  assert.match(read("lib/pdfjs.ts"), /bytes\.slice\(\)/, "pdf.js takes ownership of its buffer");
});

test("OCR is self-hosted and the searchable layer asks for blocks (regression: words missing in tesseract.js 6+)", () => {
  const ocr = read("lib/pdf-ocr.ts");
  assert.match(ocr, /workerPath: "\/ocr\/worker\.min\.js"/);
  assert.match(ocr, /langPath: "\/ocr\/lang"/);
  assert.match(ocr, /recognize\(canvas,\{\},\{blocks:true\}\)/);
});

test("no third-party script or data hosts in the CSP or app code", () => {
  const cfg = read("next.config.ts");
  assert.doesNotMatch(cfg, /jsdelivr|unpkg|cdnjs/);
  assert.match(cfg, /script-src 'self'/);
  for (const f of libFiles) assert.doesNotMatch(read("lib/" + f), /https?:\/\/(?!openrouter)/, f);
});

test("dependencies are pinned and tailwind is compiled through postcss (regression: unstyled production build)", () => {
  const pkg = JSON.parse(read("package.json"));
  for (const [n, v] of Object.entries({...pkg.dependencies, ...pkg.devDependencies})) assert.match(v, /^\d/, n + " must be pinned, got " + v);
  assert.match(read("postcss.config.mjs"), /@tailwindcss\/postcss/);
});

test("sidebar and tool deep links are wired", () => {
  const page = read("app/page.tsx");
  assert.match(page, /href="#favourites"/);
  assert.match(page, /id="favourites"/);
  assert.match(page, /get\("tool"\)/);
  assert.match(page, /window\.history\.pushState\(\{ pmTool: true \}/);
});

test("rate limiter: shared Redis when configured, in-memory fallback when not or when Redis is down", async () => {
  const http = await import("node:http");
  const {rateLimit} = await import("../lib/rate-limit.ts");
  const hits = []; const counts = new Map();
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", c => body += c); req.on("end", () => {
      const cmds = JSON.parse(body); hits.push({auth: req.headers.authorization, cmds});
      const n = (counts.get(cmds[0][1]) || 0) + 1; counts.set(cmds[0][1], n);
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify([{result: n}, {result: 1}]));
    });
  });
  await new Promise(r => srv.listen(0, r));
  process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:" + srv.address().port;
  process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
  try {
    assert.deepEqual([await rateLimit("t1", 2, 1000), await rateLimit("t1", 2, 1000), await rateLimit("t1", 2, 1000)], [true, true, false]);
    assert.equal(hits[0].auth, "Bearer secret");
    assert.deepEqual(hits[0].cmds[1].slice(0, 2), ["PEXPIRE", "pdfmate:rl:t1"]);
    assert.equal(await rateLimit("other", 2, 1000), true, "separate keys have separate counters");
  } finally { srv.close(); }
  process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:9"; // unreachable -> must not throw, falls back to memory
  assert.deepEqual([await rateLimit("m1", 1, 1000), await rateLimit("m1", 1, 1000)], [true, false]);
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.deepEqual([await rateLimit("m2", 1, 1000), await rateLimit("m2", 1, 1000)], [true, false]);
});
