import subprocess, os
from playwright.sync_api import sync_playwright
B="http://localhost:3100"
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900},accept_downloads=True); pg=ctx.new_page()
    reqs=[]; viol=[]; errs=[]
    pg.on("request",lambda r: reqs.append((r.method,r.url.replace(B,"").replace("http://127.0.0.1:8099","WORKER"))) if r.method=="POST" else None)
    pg.on("console",lambda m: viol.append(m.text[:140]) if ("Refused to" in m.text or "CORS" in m.text) else None); pg.on("pageerror",lambda e:errs.append(str(e)))
    def run(tool,file,fill=None):
        pg.goto(f"{B}/?tool={tool}"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]",file)
        if fill: fill()
        reqs.clear()
        with pg.expect_download(timeout=90000) as d: pg.locator("[role=dialog] button",has_text="Process").click()
        path=f"/tmp/e2e/direct_{tool}_{os.path.basename(file)}"; d.value.save_as(path); return path
    f=lambda r:[x for x in r if "token" in x[1] or "WORKER" in x[1] or "/api/pdf" in x[1]]
    ok=lambda path: subprocess.run(["qpdf","--check",path],capture_output=True).returncode in (0,3)
    CK=[]
    out=run("compress","/tmp/e2e/sample.pdf"); print("compress small :",f(reqs),"valid:",ok(out)); CK.append(ok(out) and [x[1] for x in f(reqs)]==["/api/pdf/token","WORKER/"])
    out=run("compress","/tmp/e2e/big.pdf"); print("compress 6.5MB :",f(reqs),"valid:",ok(out),os.path.getsize(out),"bytes"); CK.append(ok(out) and [x[1] for x in f(reqs)]==["/api/pdf/token","WORKER/"])
    out=run("protect","/tmp/e2e/sample.pdf",lambda: pg.locator("[role=dialog] input[type=password]").fill("longpassword1")); pw_ok=subprocess.run(["qpdf","--password=longpassword1","--check",out],capture_output=True).returncode in (0,3); print("protect        :",f(reqs),"needs pw:",not ok(out),"opens w/ pw:",pw_ok); CK.append((not ok(out)) and pw_ok and [x[1] for x in f(reqs)]==["/api/pdf/token","WORKER/"])
    print("CSP/CORS violations:",viol or "none","| page errors:",errs or "none"); CK.append(not viol and not errs)
    b.close()
import sys; print("RESULT:", "PASS" if all(CK) else "FAIL", CK); sys.exit(0 if all(CK) else 1)
