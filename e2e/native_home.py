import sys, re, subprocess, json
from playwright.sync_api import sync_playwright
URL="http://localhost:8200/index.html"
R=[]; 
def ck(name, ok, detail=""): R.append((ok,name,detail)); print(("PASS " if ok else "FAIL ")+name+(" — "+str(detail) if detail and not ok else ""))
def run(width,height,label):
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":width,"height":height},accept_downloads=True,has_touch=width<700); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    nav=[]; 
    pg.route("**/pdfmate-flax.vercel.app/**", lambda r:(nav.append(r.request.url), r.fulfill(status=200,content_type="text/html",body="<html><body>workspace</body></html>")))
    pg.goto(URL); pg.wait_for_selector("#qa .qb")
    # onboarding
    ck(f"[{label}] onboarding shows on first run", pg.locator(".ob").count()==1)
    pg.locator("[data-ob=next]").click(); pg.locator("[data-ob=next]").click(); 
    ck(f"[{label}] onboarding last button says Get started", "Get started" in pg.locator("[data-ob=next]").inner_text())
    pg.locator("[data-ob=next]").click(); ck(f"[{label}] onboarding closes", pg.locator(".ob").count()==0)
    pg.reload(); pg.wait_for_selector("#qa .qb"); ck(f"[{label}] onboarding not shown again", pg.locator(".ob").count()==0)
    # header New PDF
    pg.locator("header button[data-open=auto]").click(); pg.wait_for_selector("#v-app h1")
    ck(f"[{label}] New PDF -> auto tool screen", "#/tool/auto" in pg.url and "Auto PDF Mode" in pg.locator("#v-app h1").inner_text(), pg.url)
    ck(f"[{label}] home hidden on tool screen", not pg.locator("#dashboard").is_visible())
    pg.go_back(); pg.wait_for_timeout(250)
    ck(f"[{label}] Back from tool -> home", pg.locator("#dashboard").is_visible() and "#/tool" not in pg.url, pg.url)
    # quick action + All tools button + back cycle
    pg.locator("#qa .qb").nth(2).click(); pg.wait_for_selector("#v-app h1"); ck(f"[{label}] quick action opens Merge", "Merge PDF" in pg.locator("#v-app h1").inner_text())
    hl=pg.evaluate("history.length"); pg.locator("#v-app .back").click(); pg.wait_for_timeout(400)
    ck(f"[{label}] '← All tools' returns to home", pg.locator("#dashboard").is_visible() and "#/tool" not in pg.url, pg.url)
    ck(f"[{label}] '← All tools' lands on the tools grid", pg.evaluate("(()=>{const r=document.getElementById('tools').getBoundingClientRect();return r.top<400&&r.bottom>0})()"))
    ck(f"[{label}] '← All tools' adds NO history entry (no bounce loop)", pg.evaluate("history.length")==hl, f"{hl}->{pg.evaluate('history.length')}")
    pg.go_back(); pg.wait_for_timeout(300)
    ck(f"[{label}] Back after '← All tools' does not re-enter the tool", "#/tool/merge" not in pg.url, pg.url)
    # search
    pg.goto(URL+"#/"); pg.wait_for_selector("#qa .qb")
    q=pg.locator("#q") if width>=768 else pg.locator("#q2")
    q.fill("merge"); pg.wait_for_timeout(100)
    ck(f"[{label}] search filters to 1 tool", pg.locator("#tools-grid .tool").count()==1 and "1 tool" in pg.locator("#count").inner_text(), pg.locator("#count").inner_text())
    q.press("Enter"); pg.wait_for_selector("#v-app h1"); ck(f"[{label}] Enter opens top match", "#/tool/merge" in pg.url, pg.url)
    pg.go_back(); pg.wait_for_timeout(300)
    q=pg.locator("#q") if width>=768 else pg.locator("#q2"); q.fill("zzzz"); ck(f"[{label}] empty search state", pg.locator(".empty.none").count()==1); q.press("Escape")
    # chips
    pg.locator("[data-cat=Convert]").click(); ck(f"[{label}] category chip filters", pg.locator("#tools-grid .tool").count()==3, pg.locator("#tools-grid .tool").count())
    pg.locator("[data-cat=Convert]").press("ArrowRight"); ck(f"[{label}] chip arrow key moves", pg.locator("[data-cat=Smart][aria-selected=true]").count()==1)
    pg.locator("[data-cat=All]").click()
    # nav menus
    if width<1024:
        for lab,sel in [("Tools","#tools"),("Files","#v-app"),("Account","#v-app"),("Home","#dashboard")]:
            pg.locator(".bnav a",has_text=lab).click(); pg.wait_for_timeout(350)
            ok=pg.locator(sel).is_visible(); ck(f"[{label}] bottom nav '{lab}' works", ok, pg.url)
            if lab in("Files","Account"): ck(f"[{label}] bottom nav '{lab}' marked current", pg.locator(f".bnav a[aria-current=true]",has_text=lab).count()==1)
    else:
        for lab in ["Dashboard","PDF Tools","My Documents","Favourites","AI PDF","Account & Cloud"]:
            pg.goto(URL+"#/"); pg.wait_for_selector("#qa .qb"); pg.locator("aside nav a",has_text=lab).click(); pg.wait_for_timeout(500)
            u=pg.url; vis_app=pg.locator("#v-app").is_visible()
            if lab=="My Documents": ck(f"[{label}] sidebar '{lab}' -> files screen", vis_app and "#/files" in u, u)
            elif lab.startswith("Account"): ck(f"[{label}] sidebar '{lab}' -> account screen", vis_app and "#/account" in u, u)
            elif lab=="AI PDF": ck(f"[{label}] sidebar '{lab}' -> AI tool", "#/tool/ai" in u, u)
            elif lab=="Favourites":
                top=pg.evaluate("document.getElementById('favourites').getBoundingClientRect().top")
                ck(f"[{label}] sidebar 'Favourites' scrolls to the favourites panel", u.endswith("#favourites") and -5<=top<=200, f"url={u} favTop={top}")
            else: ck(f"[{label}] sidebar '{lab}' stays on home", pg.locator("#dashboard").is_visible(), u)
    # images flow
    pg.goto(URL+"#/tool/images"); pg.wait_for_selector("#fi",state="attached")
    pg.set_input_files("#fi",["/tmp/e2e/a.png","/tmp/e2e/b.jpg"]); pg.wait_for_selector(".file")
    ck(f"[{label}] 2 files listed", pg.locator(".file").count()==2)
    pg.set_input_files("#fi",["/tmp/e2e/hello.txt"]); ck(f"[{label}] bad file type rejected", pg.locator(".note.err").count()==1)
    pg.locator("[data-act=dn][data-i='0']").click(); ck(f"[{label}] reorder works", "b.jpg" in pg.locator(".file b").first.inner_text())
    pg.locator("[data-act=next]").click(); pg.select_option("#o_size","A4"); pg.locator("[data-act=run]").click()
    pg.wait_for_selector("[data-act=dl]",timeout=15000); ck(f"[{label}] result screen shown", "ready" in pg.locator("#v-app h2").inner_text())
    with pg.expect_download() as d: pg.locator("[data-act=dl]").click()
    path=f"/tmp/e2e/out_{label}.pdf"; d.value.save_as(path); out=subprocess.run(["pdfinfo",path],capture_output=True,text=True).stdout
    ck(f"[{label}] downloaded PDF valid (2 pages A4)", "Pages:           2" in out and "A4" in out, out.replace("\n"," | ")[:120])
    pg.locator(".bnav a",has_text="Files").click() if width<1024 else pg.goto(URL+"#/files"); pg.wait_for_timeout(300)
    ck(f"[{label}] result appears in My documents", pg.locator("#v-app .file").count()>=1)
    # back button inside the tool flow (steps)
    pg.goto(URL+"#/"); pg.wait_for_selector("#qa .qb"); pg.goto(URL+"#/tool/images"); pg.wait_for_selector("#fi",state="attached")
    pg.set_input_files("#fi",["/tmp/e2e/a.png"]); pg.wait_for_selector(".file"); pg.locator("[data-act=next]").click(); pg.wait_for_selector("#o_size")
    pg.go_back(); pg.wait_for_selector("#fi",state="attached")
    ck(f"[{label}] Back from Options -> Upload step, file kept", pg.locator(".file").count()==1 and "#/tool/images" in pg.url, pg.url)
    pg.go_forward(); pg.wait_for_timeout(200); 
    ck(f"[{label}] Forward -> Options again", pg.locator("#o_size").count()==1)
    pg.locator("[data-act=run]").click(); pg.wait_for_selector("[data-act=dl]",timeout=15000); pg.go_back(); pg.wait_for_selector("#o_size")
    ck(f"[{label}] Back from Result -> Options (not out of the tool)", "#/tool/images" in pg.url and pg.locator("#o_size").count()==1, pg.url)
    pg.locator("[data-act=prev]").click(); pg.wait_for_selector("#fi",state="attached"); ck(f"[{label}] in-screen 'Back' button -> Upload step", pg.locator(".file").count()==1)
    pg.go_back(); pg.wait_for_timeout(300); ck(f"[{label}] Back from Upload step leaves the tool", "#/tool/images" not in pg.url, pg.url)
    # deep-opened tool: '← All tools' falls back to #/tools
    pg.goto("about:blank"); pg.goto(URL+"#/tool/merge"); pg.wait_for_selector("[data-back]"); pg.locator("[data-back]").first.click(); pg.wait_for_timeout(300)
    ck(f"[{label}] deep-opened tool: 'Back' falls back to home tools", pg.locator("#dashboard").is_visible() and "#/tools" in pg.url, pg.url)
    # hosted handoff
    pg.goto(URL+"#/tool/merge"); pg.wait_for_selector("[data-act=ws]"); nav.clear(); pg.locator("[data-act=ws]").click(); pg.wait_for_timeout(500)
    ck(f"[{label}] 'Continue in workspace' -> hosted ?tool=merge", any("?tool=merge" in u for u in nav), nav)
    # unknown tool + settings
    pg.goto(URL+"#/tool/nope"); pg.wait_for_selector("#v-app h1"); ck(f"[{label}] unknown tool -> not found", "not found" in pg.locator("#v-app h1").inner_text().lower())
    pg.goto(URL+"#/account"); pg.wait_for_selector("[data-act=motion]"); pg.locator("[data-act=motion]").click(); ck(f"[{label}] reduce-motion toggle persists", pg.evaluate("document.documentElement.hasAttribute('data-rm')"))
    ck(f"[{label}] no console/page errors", not errs, errs[:3])
    b.close()
run(390,844,"mobile"); run(1280,800,"desktop")
f=[r for r in R if not r[0]]; print(f"\n{len(R)-len(f)}/{len(R)} passed")
import sys as _s; _s.exit(0 if not f else 1)
