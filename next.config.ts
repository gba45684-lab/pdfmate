import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, ...securityHeaders] },
      { source: "/", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, ...securityHeaders] },
      { source: "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, ...securityHeaders] }
    ];
  },
  experimental: { optimizePackageImports: ["pdf-lib", "tesseract.js"] }
};

export default nextConfig;
