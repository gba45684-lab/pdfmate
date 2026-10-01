import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"PDFMate — PDF tools, without the busywork",description:"A fast, privacy-first online PDF toolkit."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}