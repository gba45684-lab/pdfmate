"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Something went wrong</h1>
        <p style={{ color: "#667085", margin: "0 0 20px" }}>Your files stay on your device. Reload the workspace and try again.</p>
        <button onClick={reset} style={{ minHeight: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#5b21b6", color: "#fff", fontWeight: 700 }}>Try again</button>
      </div>
    </main>
  );
}
