import { createHmac, randomBytes } from "node:crypto";

/** Short-lived, action-bound, single-use token the worker verifies (worker/server.mjs). Format: exp.nonce.action.sig */
export function mintUploadToken(secret: string, action: string, ttlSeconds = 120): string {
  const key = createHmac("sha256", secret).update("pdfmate-upload-v1").digest();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = randomBytes(12).toString("hex");
  const sig = createHmac("sha256", key).update(`${exp}.${nonce}.${action}`).digest("hex");
  return `${exp}.${nonce}.${action}.${sig}`;
}
