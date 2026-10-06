"""Cloud documents through the real UI (save -> list -> download -> delete) against the mock Supabase. Needs the same env as api_routes.py."""
import base64, json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__)); import mock_services as M
from playwright.sync_api import sync_playwright
M.start(); B = "http://localhost:3100"; R = []
def ck(name, ok, detail=""): R.append(ok); print(("PASS " if ok else "FAIL ") + name + ("" if ok or not detail else " — " + str(detail)[:220]))
sess = {"access_token": "good-token", "refresh_token": "r", "expires_at": 4102444800, "expires_in": 3600, "token_type": "bearer", "user": {"id": "u-123", "aud": "authenticated", "email": "u-123@example.com"}}
val = "base64-" + base64.urlsafe_b64encode(json.dumps(sess).encode()).decode().rstrip("=")
def wait(cond, secs=15):
    for _ in range(int(secs * 4)):
        if cond(): return True
        pg.wait_for_timeout(250)  # pumps Playwright events (time.sleep would not)
    return False
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---- signed-in user
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); ctx.add_cookies([{"name": "sb-127-auth-token", "value": val, "url": B}]); pg = ctx.new_page()
    errs = []; viol = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: viol.append(m.text[:140]) if ("Refused to" in m.text or "CORS" in m.text) else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(B + "/"); pg.wait_for_selector("#cloud"); pg.wait_for_timeout(800)
    ck("signed-in: empty cloud list renders", "No cloud files yet" in pg.locator("#cloud").inner_text(), pg.locator("#cloud").inner_text()[:120])
    pg.goto(B + "/?tool=watermark"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]", "/tmp/e2e/sample.pdf")
    pg.locator("[role=dialog] button", has_text="Save original to private cloud").click()
    ok = wait(lambda: len(M.DOCS) == 1)
    ck("save: file uploaded straight to Supabase storage (signed upload) under the user's folder", ok and any(k.startswith("u-123/") and k.endswith("-sample.pdf") and v == os.path.getsize("/tmp/e2e/sample.pdf") or (k.startswith("u-123/") and v > 1000) for k, v in M.FILES.items()), (M.FILES, M.DOCS))
    ck("save: metadata row registered with the same storage path", ok and M.DOCS[0]["storage_path"] in M.FILES and M.DOCS[0]["user_id"] == "u-123" and M.DOCS[0]["name"] == "sample.pdf", M.DOCS)
    ck("save: UI confirms", wait(lambda: "Saved to your private cloud" in pg.locator("[role=dialog]").inner_text()), pg.locator("[role=dialog]").inner_text()[-160:])
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    ck("list: saved document appears in My documents", wait(lambda: "sample.pdf" in pg.locator("#cloud").inner_text()), pg.locator("#cloud").inner_text()[:160])
    opened = []; ctx.on("request", lambda r: opened.append(r.url) if "dl-token-1" in r.url else None)
    pg.locator("#cloud button", has_text="Open").first.click(); wait(lambda: opened)
    ck("open: requests a short-lived signed URL for the stored object", bool(opened) and "u-123/" in opened[0] and "sample.pdf" in opened[0], opened)
    for extra in ctx.pages[1:]: extra.close()
    # simulate the row disappearing server-side (e.g. deleted on another device): the user must see an error, then the list refreshes
    M.DOCS[:] = []; pg.locator("#cloud button", has_text="Delete").first.click()
    ck("delete of a missing document shows a visible error in the panel", wait(lambda: pg.locator("#cloud [role=alert]").count() == 1), pg.locator("#cloud").inner_text()[:200])
    ck("...and the stale row disappears after the automatic refresh", wait(lambda: "No cloud files yet" in pg.locator("#cloud").inner_text()))
    pg.goto(B + "/?tool=watermark"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]", "/tmp/e2e/sample.pdf")
    pg.locator("[role=dialog] button", has_text="Save original to private cloud").click(); wait(lambda: len(M.DOCS) == 1); pg.keyboard.press("Escape"); wait(lambda: "sample.pdf" in pg.locator("#cloud").inner_text())
    pg.locator("#cloud button", has_text="Delete").first.click()
    ck("delete: row removed", wait(lambda: len(M.DOCS) == 0), M.DOCS)
    ck("delete: storage object removed too", any(x.startswith("u-123/") for x in M.CALLS["storage_removed"]), M.CALLS["storage_removed"])
    ck("delete: list returns to empty state", wait(lambda: "No cloud files yet" in pg.locator("#cloud").inner_text()), pg.locator("#cloud").inner_text()[:120])
    ck("signed-in run: no page errors, no CSP/CORS violations", not errs and not viol, (errs, viol)); ctx.close()
    files_before = dict(M.FILES)
    # ---- signed-out user
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900}); pg2 = ctx2.new_page(); errs2 = []; pg2.on("pageerror", lambda e: errs2.append(str(e)))
    pg2.goto(B + "/?tool=watermark"); pg2.wait_for_selector("[role=dialog]"); pg2.set_input_files("[role=dialog] input[type=file]", "/tmp/e2e/sample.pdf")
    pg2.locator("[role=dialog] button", has_text="Save original to private cloud").click(); pg2.wait_for_timeout(1500)
    t = pg2.locator("[role=dialog]").inner_text()
    ck("signed-out: save is refused with a clear message and nothing is stored", ("Sign in to save files" in t) and not M.DOCS and M.FILES == files_before, (t[-160:], M.DOCS, M.FILES))
    ck("signed-out: no page errors", not errs2, errs2); b.close()
print(f"\n{sum(R)}/{len(R)} passed")
import sys as _s; _s.exit(0 if all(R) else 1)
