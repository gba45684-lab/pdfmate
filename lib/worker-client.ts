export type WorkerAction = "protect" | "compress" | "office-to-pdf";

const PROXY_SAFE_BYTES = 4 * 1024 * 1024; // Vercel serverless request-body limit is ~4.5 MB

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  if (typeof data?.error === "string") return data.error;
  if (res.status === 413) return "This file is too large for the hosted proxy. Try a smaller file.";
  return fallback;
}

/** Runs a secure worker operation. Uploads directly to the worker when enabled, otherwise through the same-origin proxy. */
export async function runWorker(action: WorkerAction, file: File, fallbackError: string, password?: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("action", action);
  if (password) form.append("password", password);

  const t = await fetch("/api/pdf/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);

  if (t?.direct) {
    if (typeof t.maxBytes === "number" && file.size > t.maxBytes) throw new Error("File is too large (limit " + Math.round(t.maxBytes / 1048576) + " MB).");
    try {
      const res = await fetch(t.url, { method: "POST", headers: { "X-Upload-Token": t.token }, body: form });
      if (!res.ok) throw new Error(await readError(res, fallbackError));
      return await res.blob();
    } catch (e) {
      if (!(e instanceof TypeError) || file.size > PROXY_SAFE_BYTES) throw e instanceof TypeError ? new Error("Could not reach the PDF worker. Check your connection and try again.") : e;
      // Network/CORS failure on a small file: fall through to the proxy.
    }
  }
  const res = await fetch(action === "protect" ? "/api/pdf/protect" : "/api/pdf/worker", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, fallbackError));
  return res.blob();
}
