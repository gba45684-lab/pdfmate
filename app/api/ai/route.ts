import { NextRequest, NextResponse } from "next/server";
import { clientIp, forbidden, rateLimit, sameOrigin } from "../../../lib/guard";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 180_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 60_000;
const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbidden();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return err("AI service is not configured.", 503);
  if (!(await rateLimit("ai:" + clientIp(request), 20, 60_000))) return err("Rate limit exceeded. Try again shortly.", 429);

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return err("AI request is too large.", 413);
  let body: { messages?: unknown; model?: unknown } | null = null;
  try { body = JSON.parse(raw); } catch { return err("Invalid AI request.", 400); }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return err("messages are required.", 400);
  if (messages.length > MAX_MESSAGES) return err("Too many messages.", 400);
  const safeMessages = messages
    .map((m: { role?: unknown; content?: unknown }) => ({
      role: m?.role === "system" || m?.role === "assistant" ? m.role : "user",
      content: typeof m?.content === "string" ? m.content.slice(0, MAX_MESSAGE_CHARS) : ""
    }))
    .filter((m: { content: string }) => m.content.trim());
  if (!safeMessages.length) return err("No usable message content was supplied.", 400);

  // Clients may only pick a model from the server-side allowlist; this prevents cost abuse.
  const fallback = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const allowed = (process.env.OPENROUTER_ALLOWED_MODELS || "").split(",").map(s => s.trim()).filter(Boolean);
  const requested = typeof body?.model === "string" ? body.model.trim() : "";
  const model = requested && allowed.includes(requested) ? requested : fallback;

  let upstream: Response;
  try {
    upstream = await fetch((process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://pdfmate.vercel.app", "X-Title": "PDFMate" },
      body: JSON.stringify({ model, messages: safeMessages, temperature: 0.2, max_tokens: 1800 }),
      signal: AbortSignal.timeout(25_000)
    });
  } catch {
    return err("The AI service timed out. Try again.", 504);
  }
  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) return err(upstream.status === 429 ? "The AI service is busy. Try again shortly." : "AI request failed.", upstream.status === 429 ? 429 : 502);
  return NextResponse.json({ text: data?.choices?.[0]?.message?.content || "" }, { headers: { "Cache-Control": "no-store" } });
}
