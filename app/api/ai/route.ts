import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const MAX_BODY_BYTES = 180_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 60_000;

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "AI request is too large." }, { status: 413 });

    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) return NextResponse.json({ error: "messages are required." }, { status: 400 });
    if (messages.length > MAX_MESSAGES) return NextResponse.json({ error: "Too many messages." }, { status: 400 });

    const safeMessages = messages.map((message: { role?: unknown; content?: unknown }) => ({
      role: message.role === "system" || message.role === "assistant" ? message.role : "user",
      content: typeof message.content === "string" ? message.content.slice(0, MAX_MESSAGE_CHARS) : ""
    })).filter((message: { content: string }) => message.content.trim());

    if (!safeMessages.length) return NextResponse.json({ error: "No usable message content was supplied." }, { status: 400 });

    const model = typeof body?.model === "string" && body.model.trim()
      ? body.model.trim()
      : process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://pdfmate.vercel.app",
        "X-Title": "PDFMate"
      },
      body: JSON.stringify({ model, messages: safeMessages, temperature: 0.2, max_tokens: 1800 })
    });

    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "AI request failed." }, { status: response.status });
    return NextResponse.json({ text: data?.choices?.[0]?.message?.content || "" });
  } catch {
    return NextResponse.json({ error: "Invalid AI request." }, { status: 400 });
  }
}
