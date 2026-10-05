"""Local mock OpenRouter (:9200) and Supabase (:9100: GoTrue user, PostgREST documents, Storage) used by e2e/api_routes.py."""
import json, threading, uuid, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

USERS = {"good-token": "u-123", "other-token": "u-999"}
DOCS = []            # PostgREST table
FILES = {}           # storage objects: path -> byte length
CALLS = {"ai": [], "storage_removed": [], "signed": [], "uploads": []}

class Quiet(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):  # the real Supabase API answers cross-origin browser calls with CORS headers
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, x-upsert, cache-control")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"); super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Content-Length", "0"); self.end_headers()
    def body(self):
        n = int(self.headers.get("content-length") or 0); raw = self.rfile.read(n) if n else b""
        try: return json.loads(raw or b"null")
        except Exception: return None
    def send_json(self, status, obj, headers=None):
        data = json.dumps(obj).encode() if obj is not None else b""
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(data)

class OpenRouter(Quiet):
    def do_POST(self):
        b = self.body(); CALLS["ai"].append({"auth": self.headers.get("authorization"), "body": b, "path": self.path})
        text = json.dumps(b)
        if "TRIGGER429" in text: return self.send_json(429, {"error": {"message": "upstream rate limited secret-detail"}})
        if "TRIGGER500" in text: return self.send_json(500, {"error": {"message": "upstream exploded secret-detail"}})
        self.send_json(200, {"choices": [{"message": {"content": "MOCK ANSWER from " + str(b.get("model"))}}]})

class Supabase(Quiet):
    def user(self):
        tok = (self.headers.get("authorization") or "").replace("Bearer ", ""); return USERS.get(tok)
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == "/auth/v1/user":
            uid = self.user()
            return self.send_json(200, {"id": uid, "aud": "authenticated", "role": "authenticated", "email": uid + "@example.com", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}) if uid else self.send_json(401, {"msg": "invalid JWT"})
        if u.path == "/rest/v1/documents":
            rows = [d for d in DOCS if all(d.get(k) == v[0][3:] for k, v in q.items() if k in ("id", "user_id") and v[0].startswith("eq."))]
            rows.sort(key=lambda d: d["created_at"], reverse=True)
            if "pgrst.object" in (self.headers.get("accept") or ""):
                return self.send_json(200, rows[0]) if len(rows) == 1 else self.send_json(406, {"code": "PGRST116", "message": "JSON object requested, multiple (or no) rows returned"})
            return self.send_json(200, rows)
        if u.path.startswith("/storage/v1/object/sign/documents/") and "token=dl-token-1" in u.query:
            data = b"%PDF-1.4 mock"; self.send_response(200); self.send_header("Content-Type", "application/pdf"); self.send_header("Content-Length", str(len(data))); self.end_headers(); return self.wfile.write(data)
        self.send_json(404, {"message": "not found " + u.path})
    def do_POST(self):
        u = urlparse(self.path); b = self.body()
        if u.path == "/rest/v1/documents":
            row = {"id": str(uuid.uuid4()), "created_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() + len(DOCS))), **b}; DOCS.append(row)
            return self.send_json(201, row if "pgrst.object" in (self.headers.get("accept") or "") else [row])
        if u.path.startswith("/storage/v1/object/upload/sign/"):
            CALLS["uploads"].append(u.path.split("/sign/documents/")[1]); return self.send_json(200, {"url": u.path.replace("/storage/v1", "") + "?token=upload-token-1"})
        if u.path.startswith("/storage/v1/object/sign/"):
            CALLS["signed"].append(u.path.split("/sign/documents/")[1]); return self.send_json(200, {"signedURL": u.path.replace("/storage/v1", "") + "?token=dl-token-1"})
        self.send_json(404, {"message": "not found " + u.path})
    def do_PUT(self):
        u = urlparse(self.path); n = int(self.headers.get("content-length") or 0); raw = self.rfile.read(n) if n else b""
        if u.path.startswith("/storage/v1/object/upload/sign/documents/") and "token=upload-token-1" in u.query:
            path = u.path.split("/sign/documents/")[1]; FILES[path] = len(raw); return self.send_json(200, {"Key": "documents/" + path})
        self.send_json(401, {"message": "bad upload token"})
    def do_DELETE(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == "/rest/v1/documents":
            keep = [d for d in DOCS if not all(d.get(k) == v[0][3:] for k, v in q.items() if k in ("id", "user_id"))]; DOCS[:] = keep; return self.send_json(204, None)
        if u.path.startswith("/storage/v1/object/documents"):
            b = self.body() or {}; CALLS["storage_removed"] += b.get("prefixes", [])
            for pth in b.get("prefixes", []): FILES.pop(pth, None)
            return self.send_json(200, [])
        self.send_json(404, {"message": "not found"})

def start():
    for port, cls in ((9200, OpenRouter), (9100, Supabase)):
        s = ThreadingHTTPServer(("127.0.0.1", port), cls); threading.Thread(target=s.serve_forever, daemon=True).start()
