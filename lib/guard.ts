import { NextRequest, NextResponse } from "next/server";

/** Browser-only API: accept same-origin (or the configured app origin) requests. */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).host;
    const own = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (own && host === own) return true;
    const app = process.env.NEXT_PUBLIC_APP_URL;
    return Boolean(app) && new URL(app as string).host === host;
  } catch {
    return false;
  }
}

export const forbidden = () => NextResponse.json({ error: "Forbidden origin." }, { status: 403 });

export function clientIp(request: NextRequest): string {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export { rateLimit } from "./rate-limit";
