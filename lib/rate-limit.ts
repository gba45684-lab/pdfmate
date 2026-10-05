// Rate limiting: shared across instances via Upstash Redis (REST) when UPSTASH_REDIS_REST_URL/TOKEN are set,
// otherwise (or if Redis is unreachable) a best-effort in-memory limiter per instance.
const buckets = new Map<string, { count: number; reset: number }>();
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const k = "pdfmate:rl:" + key;
      const res = await fetch(url.replace(/\/$/, "") + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", k], ["PEXPIRE", k, String(windowMs), "NX"]]),
        signal: AbortSignal.timeout(1500)
      });
      const count = Number((await res.json())?.[0]?.result);
      if (res.ok && Number.isFinite(count)) return count <= limit;
    } catch { /* fall back to the in-memory limiter */ }
  }
  return memoryLimit(key, limit, windowMs);
}

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now > b.reset) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  b.count++;
  return b.count <= limit;
}
