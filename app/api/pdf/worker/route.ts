import { NextRequest } from "next/server";
import { proxyToWorker } from "../../../../lib/worker-proxy";
import { forbidden, sameOrigin } from "../../../../lib/guard";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbidden();
  if (Number(request.headers.get("content-length") || 0) > 27_000_000) return NextResponse.json({ error: "File is too large." }, { status: 413 });
  const form = await request.clone().formData().catch(() => null);
  const action = form?.get("action");
  if (action === "compress") return proxyToWorker(request, "compress", "pdfmate-optimized.pdf");
  if (action === "office-to-pdf") return proxyToWorker(request, "office-to-pdf", "pdfmate-converted.pdf");
  return NextResponse.json({ error: "Unsupported worker action." }, { status: 400 });
}
