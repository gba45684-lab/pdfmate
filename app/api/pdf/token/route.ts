import { NextRequest, NextResponse } from "next/server";
import { clientIp, forbidden, rateLimit, sameOrigin } from "../../../../lib/guard";
import { mintUploadToken } from "../../../../lib/upload-token";

export const runtime = "nodejs";

const ACTIONS = new Set(["protect", "compress", "office-to-pdf"]);

// Lets the browser upload straight to the worker (no ~4.5 MB serverless body limit).
// Enabled only when PDF_WORKER_PUBLIC_URL is set; otherwise the client falls back to the /api/pdf/* proxy.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbidden();
  const secret = process.env.PDF_WORKER_TOKEN, url = process.env.PDF_WORKER_PUBLIC_URL;
  if (!secret || !url) return NextResponse.json({ direct: false }, { headers: { "Cache-Control": "no-store" } });
  if (!(await rateLimit("token:" + clientIp(request), 30, 60_000))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (typeof body?.action !== "string" || !ACTIONS.has(body.action)) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  return NextResponse.json(
    { direct: true, url, token: mintUploadToken(secret, body.action), maxBytes: Number(process.env.PDF_WORKER_MAX_FILE_BYTES || 52428800) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
