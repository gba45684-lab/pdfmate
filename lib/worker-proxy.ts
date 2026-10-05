import { NextRequest, NextResponse } from "next/server";
import { clientIp, forbidden, rateLimit, sameOrigin } from "./guard";

type Action = "protect" | "compress" | "office-to-pdf";
const MAX = Number(process.env.PDF_PROXY_MAX_BYTES || 25 * 1024 * 1024);
const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];
const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function proxyToWorker(request: NextRequest, action: Action, outName: string) {
  if (!sameOrigin(request)) return forbidden();
  const worker = process.env.PDF_WORKER_URL, token = process.env.PDF_WORKER_TOKEN;
  if (!worker) return err("Secure PDF worker is not configured.", 503);
  if (!(await rateLimit("worker:" + clientIp(request), 10, 60_000))) return err("Too many requests. Try again shortly.", 429);
  if (Number(request.headers.get("content-length") || 0) > MAX + 1_000_000) return err("File is too large.", 413);

  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("file");
  if (!(file instanceof File) || file.size === 0) return err("A non-empty input file is required.", 400);
  if (file.size > MAX) return err("File is too large (limit " + Math.round(MAX / 1048576) + " MB).", 413);
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!(action === "office-to-pdf" ? OFFICE : ["pdf"]).includes(ext)) return err("Unsupported file type.", 415);

  const form = new FormData();
  form.append("file", file, "input." + ext);
  form.append("action", action);
  if (action === "protect") {
    const password = incoming?.get("password");
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return err("Password must be 8–128 characters.", 400);
    form.append("password", password);
  }

  let upstream: Response;
  try {
    upstream = await fetch(worker, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : undefined, body: form, signal: AbortSignal.timeout(120_000) });
  } catch {
    return err("The PDF worker is unreachable or timed out.", 504);
  }
  if (!upstream.ok) {
    let message = "PDF worker failed.";
    if (upstream.status === 422 || upstream.status === 400) {
      const data = await upstream.json().catch(() => null);
      if (typeof data?.error === "string") message = data.error.slice(0, 200);
    }
    return err(message, upstream.status === 422 || upstream.status === 400 ? 422 : 502);
  }
  return new NextResponse(upstream.body, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="' + outName + '"', "Cache-Control": "no-store" } });
}
