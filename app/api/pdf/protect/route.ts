import { NextRequest } from "next/server";
import { proxyToWorker } from "../../../../lib/worker-proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return proxyToWorker(request, "protect", "pdfmate-protected.pdf");
}
