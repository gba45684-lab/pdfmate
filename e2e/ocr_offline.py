import subprocess
from playwright.sync_api import sync_playwright
B="http://localhost:3100"; ext=[]; local=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900},accept_downloads=True); pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    def handler(route):
        u=route.request.url
        if u.startswith(B) or u.startswith("blob:") or u.startswith("data:"): local.append(u.replace(B,"")); route.continue_()
        else: ext.append(u); route.abort()
    ctx.route("**/*",handler)
    for lang,fixture,needle in (("eng","/tmp/e2e/scan.pdf","pdfmate"),):
        pg.goto(B+"/?tool=ocr"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]",fixture)
        with pg.expect_download(timeout=120000) as d: pg.locator("[role=dialog] button",has_text="Process").click()
        d.value.save_as("/tmp/e2e/ocr_offline.pdf")
    txt=subprocess.run(["pdftotext","/tmp/e2e/ocr_offline.pdf","-"],capture_output=True,text=True).stdout
    print("recognized text:",repr(txt.strip()[:80]))
    print("self-hosted assets fetched:",sorted({u.split('?')[0] for u in local if u.startswith('/ocr') or u.startswith('/pdfjs')}))
    print("external requests attempted (all blocked):",ext)
    passed = "pdfmate" in txt.lower() and "12345" in txt and not ext and not errs
    print("RESULT:","PASS" if passed else f"FAIL errs={errs}")
    b.close()
import sys; sys.exit(0 if passed else 1)
