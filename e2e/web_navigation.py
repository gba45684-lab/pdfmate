from playwright.sync_api import sync_playwright
B="http://localhost:3100"
R=[]
def ck(name, ok, detail=""): R.append(ok); print(("PASS " if ok else "FAIL ")+name+(" — "+str(detail)[:160] if (detail and not ok) else ""))
def new(b,w,h):
    ctx=b.new_context(viewport={"width":w,"height":h}); pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" and not m.text.startswith("Failed to load resource") else None)
    return pg,errs
def settle(pg):
    """Wait until smooth scrolling has stopped (scrollY unchanged for 300 ms) so positions are measured at rest, even on slow CI."""
    last = None; stable = 0
    for _ in range(40):
        y = pg.evaluate("window.scrollY")
        stable = stable + 1 if y == last else 0
        if stable >= 3: return
        last = y; pg.wait_for_timeout(100)
def run(b,w,h,L):
    pg,errs=new(b,w,h); pg.goto(B+"/"); pg.wait_for_selector("h1"); pg.wait_for_timeout(500)
    ck(f"[{L}] page styled + no script errors", pg.evaluate("getComputedStyle(document.body).backgroundColor")=="rgb(246, 247, 251)" and not errs, errs)
    top=lambda sel: pg.evaluate("(s)=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().top):null}",sel)
    # ---- menu
    if w>=1024:
        for lab,target in (("PDF Tools","#tools"),("My Documents","#cloud"),("Favourites","#favourites"),("Dashboard","#dashboard")):
            pg.locator("aside a",has_text=lab).first.click(); settle(pg)
            t=top(target); ck(f"[{L}] sidebar '{lab}' scrolls to {target}", pg.url.endswith(target) and t is not None and -10<=t<=220 or (target=="#cloud" and t is not None and 0<=t<=pg.viewport_size["height"]-100), f"url={pg.url} top={t}")
        pg.locator("aside a",has_text="AI PDF").click(); pg.wait_for_timeout(300)
        ck(f"[{L}] sidebar 'AI PDF' opens the AI tool", pg.locator("[role=dialog][aria-label='AI PDF']").count()==1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        # header
        pg.locator("header button",has_text="New PDF").click(); pg.wait_for_timeout(300)
        ck(f"[{L}] header '+ New PDF' opens a tool dialog", pg.locator("[role=dialog]").count()==1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        n0=pg.locator("#tools button").count(); pg.locator("header input").fill("merge"); pg.wait_for_timeout(300); n1=pg.locator("#tools button").count()
        ck(f"[{L}] header search filters tools ({n0}->{n1})", n1<n0 and n1>=1, f"{n0}->{n1}"); pg.locator("header input").fill("")
        pg.locator("aside a",has_text="Account & Cloud").click(); pg.wait_for_url("**/auth"); ck(f"[{L}] sidebar 'Account & Cloud' -> /auth", "/auth" in pg.url)
    else:
        for lab,target in (("Tools","#tools"),("Cloud","#cloud"),("Home","#dashboard")):
            pg.locator("nav a:visible",has_text=lab).first.click(); settle(pg); t=top(target)
            ck(f"[{L}] bottom nav '{lab}' scrolls to {target}", pg.url.endswith(target) and t is not None and -10<=t<=220, f"url={pg.url} top={t}")
        pg.locator("nav a:visible",has_text="Account").click(); pg.wait_for_url("**/auth"); ck(f"[{L}] bottom nav 'Account' -> /auth", "/auth" in pg.url)
    ck(f"[{L}] /auth has a way back", pg.locator("a",has_text="Back to PDFMate").count()==1)
    pg.locator("a",has_text="Back to PDFMate").click(); pg.wait_for_url(B+"/"); ck(f"[{L}] auth '← Back' returns to app", pg.url.rstrip("/")==B)
    pg.go_back(); pg.wait_for_url("**/auth"); pg.go_back(); pg.wait_for_timeout(400); ck(f"[{L}] browser Back from /auth returns to app", pg.url.split("#")[0].rstrip("/")==B, pg.url)
    # ---- dialog behaviour
    pg.goto(B+"/"); pg.wait_for_selector("h1"); pg.evaluate("window.__marker=1")
    q=pg.locator("button",has_text="Merge PDF").first; hl=pg.evaluate("history.length"); q.click(); pg.wait_for_selector("[role=dialog]")
    ck(f"[{L}] click tool -> dialog", pg.locator("[role=dialog] h2",has_text="Merge PDF").count()==1)
    ck(f"[{L}] dialog locks background scroll", pg.evaluate("document.body.style.overflow")=="hidden")
    ck(f"[{L}] focus moves into dialog", pg.evaluate("document.activeElement.getAttribute('role')")=="dialog")
    ck(f"[{L}] opening adds one history entry", pg.evaluate("history.length")==hl+1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    ck(f"[{L}] Escape closes dialog", pg.locator("[role=dialog]").count()==0)
    ck(f"[{L}] scroll unlocked after close", pg.evaluate("document.body.style.overflow")!="hidden")
    ck(f"[{L}] focus returns to opener", "Merge PDF" in pg.evaluate("document.activeElement.innerText"), pg.evaluate("document.activeElement.innerText"))
    q.click(); pg.wait_for_selector("[role=dialog]"); pg.locator("[role=dialog] button[aria-label=Close]").click(); pg.wait_for_timeout(400)
    ck(f"[{L}] ✕ closes dialog", pg.locator("[role=dialog]").count()==0 and pg.url.rstrip("/")==B)
    q.click(); pg.wait_for_selector("[role=dialog]"); pg.go_back(); pg.wait_for_timeout(500)
    ck(f"[{L}] browser/hardware Back closes dialog (stays in app, no reload)", pg.locator("[role=dialog]").count()==0 and pg.evaluate("window.__marker")==1 and pg.url.rstrip("/")==B, pg.url)
    pg.go_forward(); pg.wait_for_timeout(400); ck(f"[{L}] Forward after close does not break the page", pg.locator("[role=dialog]").count()==0 and pg.evaluate("window.__marker")==1)
    # ---- deep link
    pg.goto("about:blank"); pg.goto(B+"/?tool=merge"); pg.wait_for_selector("[role=dialog]"); pg.wait_for_timeout(300)
    ck(f"[{L}] deep link ?tool=merge opens Merge", pg.locator("[role=dialog] h2",has_text="Merge PDF").count()==1)
    ck(f"[{L}] deep link URL cleaned", pg.url.rstrip("/")==B, pg.url)
    pg.evaluate("window.__marker=2"); pg.go_back(); pg.wait_for_timeout(500)
    ck(f"[{L}] deep link: Back closes dialog first (no reload)", pg.locator("[role=dialog]").count()==0 and pg.evaluate("window.__marker")==2)
    pg.go_back(); pg.wait_for_timeout(500); ck(f"[{L}] deep link: second Back leaves to previous page", pg.url=="about:blank", pg.url)
    pg.goto(B+"/?tool=doesnotexist"); pg.wait_for_selector("h1"); pg.wait_for_timeout(300); ck(f"[{L}] unknown deep link ignored", pg.locator("[role=dialog]").count()==0)
    # ---- privacy
    pg.goto(B+"/"); pg.locator("footer a",has_text="Privacy").click(); pg.wait_for_url("**/privacy"); ck(f"[{L}] footer Privacy -> /privacy", pg.locator("h1",has_text="Privacy notice").count()==1)
    pg.locator("a",has_text="Back to PDFMate").click(); pg.wait_for_url(B+"/"); ck(f"[{L}] privacy '← Back' returns", True)
    ck(f"[{L}] no script errors during whole run", not errs, errs[:3]); pg.context.close()
with sync_playwright() as p:
    b=p.chromium.launch(); run(b,1280,800,"desktop"); run(b,390,844,"mobile"); b.close()
print(f"\n{sum(R)}/{len(R)} passed")
import sys as _s; _s.exit(0 if all(R) else 1)
