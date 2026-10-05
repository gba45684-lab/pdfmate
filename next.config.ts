import type { NextConfig } from "next";

const origin = (value?: string) => { try { return value ? new URL(value).origin : ""; } catch { return ""; } };
const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const connect = ["'self'", supabase, supabase.replace(/^https:/, "wss:"), origin(process.env.PDF_WORKER_PUBLIC_URL)].filter(Boolean).join(" ");
// All app assets (pdf.js worker, OCR engine and language data) are self-hosted, so no third-party script hosts are allowed.
// 'unsafe-inline' is required by Next.js inline bootstrap scripts; dev additionally needs eval for React refresh.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connect}${dev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'"
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] }
    ];
  },
  experimental: { optimizePackageImports: ["pdf-lib", "tesseract.js"] }
};

export default nextConfig;
