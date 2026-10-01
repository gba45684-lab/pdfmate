import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) return NextResponse.json({ error: "messages are required." }, { status: 400 });

    const model = typeof body?.model === "string" && body.model ? body.model : "openai/gpt-4o-mini";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://pdfmate.vercel.app",
        "X-Title": "PDFMate"
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 })
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || "AI request failed." }, { status: response.status });
    }

    return NextResponse.json({ text: data?.choices?.[0]?.message?.content || "" });
  } catch {
    return NextResponse.json({ error: "Invalid AI request." }, { status: 400 });
  }
}
