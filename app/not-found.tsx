import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Page not found</h1>
        <p style={{ color: "#667085", margin: "0 0 20px" }}>That page doesn&apos;t exist.</p>
        <Link href="/" style={{ display: "inline-grid", placeItems: "center", minHeight: 44, padding: "0 20px", borderRadius: 12, background: "#5b21b6", color: "#fff", fontWeight: 700, textDecoration: "none" }}>Back to PDFMate</Link>
      </div>
    </main>
  );
}
