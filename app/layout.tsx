import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDFMate — PDF tools, without the busywork",
  description: "A fast, privacy-first online PDF toolkit.",
  manifest: "/manifest.webmanifest",
  themeColor: "#8b5cf6"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}