import "./globals.css";
import type { Metadata, Viewport } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "PDFMate — PDF tools, without the busywork", template: "%s · PDFMate" },
  description: "A fast, privacy-first online PDF toolkit.",
  applicationName: "PDFMate",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "PDFMate", statusBarStyle: "default" },
  openGraph: { title: "PDFMate", description: "A fast, privacy-first online PDF toolkit.", type: "website", siteName: "PDFMate" },
  robots: { index: true, follow: true }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5b21b6"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
