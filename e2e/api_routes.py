"""API route behaviour against mock OpenRouter + Supabase (see mock_services.py). Run with the env shown in e2e/README.md."""
import base64, json, http.client, sys, os
sys.path.insert(0, os.path.dirname(__file__)); import mock_services as M
M.start()
R = []; ORIGIN = "http://localhost:3100"
def ck(name, ok, detail=""): R.append(ok); print(("PASS " if ok else "FAIL ") + name + ("" if ok or not detail else " — " + str(detail)[:200]))
def cookie(token, uid):
    sess = {"access_token": token, "refresh_token": "r", "expires_at": 4102444800, "expires_in": 3600, "token_type": "bearer", "user": {"id": uid, "aud": "authenticated", "email": uid + "@example.com"}}
    return "sb-127-auth-token=base64-" + base64.urlsafe_b64encode(json.dumps(sess).encode()).decode().rstrip("=")
U1, U2 = cookie("good-token", "u-123"), cookie("other-token", "u-999")
def req(method, path, body=None, origin=ORIGIN, ck_=None, ctype="application/json", raw=None):
    c = http.client.HTTPConnection("localhost", 3100, timeout=30); h = {}
    if origin: h["Origin"] = origin
    if ck_: h["Cookie"] = ck_
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    if data is not None: h["Content-Type"] = ctype
    c.request(method, path, body=data, headers=h); r = c.getresponse(); t = r.read().decode()
    try: j = json.loads(t)
    except Exception: j = None
    return r.status, j, t
# ---------------- documents / storage ----------------
ck("GET /api/documents without session -> 401", req("GET", "/api/documents", origin=None)[0] == 401)
s, j, _ = req("GET", "/api/documents", origin=None, ck_=U1); ck("GET with session -> 200 empty list", s == 200 and j == {"documents": []}, (s, j))
ck("POST without Origin -> 403", req("POST", "/api/documents", {"name": "a.pdf"}, origin=None, ck_=U1)[0] == 403)
ck("POST from evil origin -> 403", req("POST", "/api/documents", {"name": "a.pdf"}, origin="https://evil.example", ck_=U1)[0] == 403)
ck("POST without session -> 401", req("POST", "/api/documents", {"name": "a.pdf"})[0] == 401)
ck("POST non-JSON -> 415", req("POST", "/api/documents", raw="name=a", ctype="text/plain", ck_=U1)[0] == 415)
ck("POST missing name -> 400", req("POST", "/api/documents", {"size_bytes": 1}, ck_=U1)[0] == 400)
ck("POST blank name -> 400", req("POST", "/api/documents", {"name": "   "}, ck_=U1)[0] == 400)
ck("POST storage_path in ANOTHER user's folder -> 400", req("POST", "/api/documents", {"name": "x.pdf", "storage_path": "u-999/steal.pdf"}, ck_=U1)[0] == 400)
ck("POST storage_path with '..' -> 400", req("POST", "/api/documents", {"name": "x.pdf", "storage_path": "u-123/../u-999/x.pdf"}, ck_=U1)[0] == 400)
s, j, t = req("POST", "/api/documents", {"name": " report.pdf ", "storage_path": "u-123/abc-report.pdf", "size_bytes": 10**15}, ck_=U1)
row = M.DOCS[-1] if M.DOCS else {}
ck("POST valid -> created, owner forced from session, size capped", s in (200, 201) and row.get("user_id") == "u-123" and row.get("name") == "report.pdf" and row.get("size_bytes") == 5 * 1024**3, (s, t[:120], row))
req("POST", "/api/documents", {"name": "neg.pdf", "size_bytes": -5}, ck_=U1); ck("negative size clamped to 0", M.DOCS[-1].get("size_bytes") == 0, M.DOCS[-1])
req("POST", "/api/documents", {"name": "spoof.pdf", "user_id": "u-999"}, ck_=U1); ck("client-supplied user_id ignored", M.DOCS[-1].get("user_id") == "u-123")
s, j, _ = req("GET", "/api/documents", origin=None, ck_=U2); ck("other user sees none of u-123's documents", s == 200 and j["documents"] == [], j)
s, j, _ = req("GET", "/api/documents", origin=None, ck_=U1); ck("owner lists own documents", s == 200 and len(j["documents"]) == 3, (s, len(j["documents"]) if j else j))
doc = next(d for d in M.DOCS if d["name"] == "report.pdf"); did = doc["id"]
ck("download-url: other user -> 404", req("POST", "/api/storage/download-url", {"document_id": did}, ck_=U2)[0] == 404)
ck("download-url: missing id -> 400", req("POST", "/api/storage/download-url", {}, ck_=U1)[0] == 400)
ck("download-url: no session -> 401", req("POST", "/api/storage/download-url", {"document_id": did})[0] == 401)
ck("download-url: evil origin -> 403", req("POST", "/api/storage/download-url", {"document_id": did}, origin="https://evil.example", ck_=U1)[0] == 403)
s, j, t = req("POST", "/api/storage/download-url", {"document_id": did}, ck_=U1)
ck("download-url: owner gets signed url for the stored path", s == 200 and "dl-token-1" in (j or {}).get("url", "") and "u-123/abc-report.pdf" in M.CALLS["signed"], (s, t[:150], M.CALLS["signed"]))
ck("upload-url: no session -> 401", req("POST", "/api/storage/upload-url", {"name": "a.pdf"})[0] == 401)
ck("upload-url: blank name -> 400", req("POST", "/api/storage/upload-url", {"name": ""}, ck_=U1)[0] == 400)
ck("upload-url: no origin -> 403", req("POST", "/api/storage/upload-url", {"name": "a.pdf"}, origin=None, ck_=U1)[0] == 403)
s, j, t = req("POST", "/api/storage/upload-url", {"name": "../../etc/passwd"}, ck_=U1)
p = (j or {}).get("path", "")
s2, j2, _ = req("POST", "/api/storage/upload-url", {"name": "report..final.pdf"}, ck_=U1)
s3, _, t3 = req("POST", "/api/documents", {"name": "report..final.pdf", "storage_path": (j2 or {}).get("path")}, ck_=U1)
ck("a filename with '..' round-trips (upload-url then register document)", s2 == 200 and s3 in (200, 201), (s2, s3, t3[:120]))
ck("upload-url: path is inside the caller's folder and sanitized", s == 200 and p.startswith("u-123/") and ".." not in p and p.count("/") == 1 and j.get("token") == "upload-token-1", (s, t[:160]))
ck("delete: no origin -> 403", req("DELETE", "/api/documents/" + did, origin=None, ck_=U1)[0] == 403)
ck("delete: no session -> 401", req("DELETE", "/api/documents/" + did)[0] == 401)
ck("delete: other user -> 404 and document survives", req("DELETE", "/api/documents/" + did, ck_=U2)[0] == 404 and any(d["id"] == did for d in M.DOCS))
s, j, _ = req("DELETE", "/api/documents/" + did, ck_=U1)
ck("delete: owner removes row AND storage object", s == 200 and not any(d["id"] == did for d in M.DOCS) and "u-123/abc-report.pdf" in M.CALLS["storage_removed"], (s, j, M.CALLS["storage_removed"]))
# ---------------- AI ----------------
msgs = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}]
ai = lambda body, **k: req("POST", "/api/ai", body, **k)
s, j, _ = ai({"messages": msgs}); ck("ai: valid request -> answer from upstream", s == 200 and j.get("text", "").startswith("MOCK ANSWER from default-model"), (s, j))
last = M.CALLS["ai"][-1]; ck("ai: upstream got server key + OpenAI-compatible body", last["auth"] == "Bearer k" and last["path"].endswith("/chat/completions") and last["body"]["max_tokens"] == 1800, last["auth"])
ai({"messages": msgs, "model": "expensive/model"}); ck("ai: client-chosen model ignored (cost-abuse guard)", M.CALLS["ai"][-1]["body"]["model"] == "default-model", M.CALLS["ai"][-1]["body"]["model"])
ai({"messages": msgs, "model": "allowed-model"}); ck("ai: allowlisted model honoured", M.CALLS["ai"][-1]["body"]["model"] == "allowed-model")
ck("ai: no Origin -> 403", ai({"messages": msgs}, origin=None)[0] == 403)
ck("ai: evil Origin -> 403", ai({"messages": msgs}, origin="https://evil.example")[0] == 403)
ck("ai: invalid JSON -> 400", req("POST", "/api/ai", raw="{nope")[0] == 400)
ck("ai: empty messages -> 400", ai({"messages": []})[0] == 400)
ck("ai: too many messages -> 400", ai({"messages": [{"role": "user", "content": "x"}] * 13})[0] == 400)
ck("ai: oversized body -> 413", ai({"messages": [{"role": "user", "content": "x" * 200000}]})[0] == 413)
long = ai({"messages": [{"role": "user", "content": "y" * 100000}]}); ck("ai: long message truncated to 60k chars", long[0] == 200 and len(M.CALLS["ai"][-1]["body"]["messages"][0]["content"]) == 60000, M.CALLS["ai"][-1]["body"]["messages"][0]["content"][:5])
s, j, t = ai({"messages": [{"role": "user", "content": "TRIGGER429"}]}); ck("ai: upstream 429 -> 429 friendly, no upstream text leaked", s == 429 and "secret-detail" not in t, (s, t))
s, j, t = ai({"messages": [{"role": "user", "content": "TRIGGER500"}]}); ck("ai: upstream 500 -> 502 generic, no upstream text leaked", s == 502 and "secret-detail" not in t, (s, t))
codes = [ai({"messages": msgs})[0] for _ in range(25)]; ck("ai: per-IP rate limit kicks in (429 within 25 more calls)", 429 in codes, codes)
# ---------------- browser: AI tool end to end ----------------
from playwright.sync_api import sync_playwright
import time
time.sleep(1)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={"width": 1280, "height": 900}, extra_http_headers={"X-Forwarded-For": "203.0.113.77"}).new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(ORIGIN + "/?tool=ai"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]", "/tmp/e2e/sample.pdf")
    pg.locator("[role=dialog] button", has_text="Summarize").click(); pg.locator("[role=dialog] button", has_text="Ask PDF").click()
    for _ in range(40):
        if "MOCK ANSWER" in pg.locator("[role=dialog]").inner_text(): break
        time.sleep(0.5)
    t = pg.locator("[role=dialog]").inner_text(); body = M.CALLS["ai"][-1]["body"]
    ck("browser: AI tool shows the mocked answer", "MOCK ANSWER from default-model" in t, t[-200:])
    ck("browser: PDF text (extracted via the self-hosted pdf.js worker) reached the model", "PDFMate sample" in json.dumps(body["messages"]), json.dumps(body)[:200])
    ck("browser: no page errors", not errs, errs); b.close()
print(f"\n{sum(R)}/{len(R)} passed")
import sys as _s; _s.exit(0 if all(R) else 1)
