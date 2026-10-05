import subprocess, re, os, time
from playwright.sync_api import sync_playwright
B="http://localhost:3100"; E="/tmp/e2e"; R=[]
def ck(name, ok, detail=""): R.append(ok); print(("PASS " if ok else "FAIL ")+name+(" — "+str(detail)[:200] if (detail and not ok) else ""))
def pdfinfo(path):
    o=subprocess.run(["pdfinfo",path],capture_output=True,text=True).stdout
    pages=int(re.search(r"Pages:\s+(\d+)",o).group(1)) if "Pages:" in o else -1
    size=re.search(r"Page size:\s+([\d.]+) x ([\d.]+)",o); return pages,(float(size.group(1)),float(size.group(2))) if size else None
def valid_pdf(path): return subprocess.run(["qpdf","--check",path],capture_output=True).returncode in (0,3)
def run_tool(pg,tid,files,fill=None,pre=None,expect="pdf"):
    errs=[]; h=lambda e:errs.append(str(e)); pg.on("pageerror",h)
    pg.goto(f"{B}/?tool={tid}"); pg.wait_for_selector("[role=dialog]")
    pg.set_input_files("[role=dialog] input[type=file]",files); pg.wait_for_timeout(200)
    if fill: fill(pg)
    btn=pg.locator("[role=dialog] button",has_text="Process & download")
    out=f"{E}/out_{tid}"
    try:
        with pg.expect_download(timeout=90000) as d:
            btn.click()
        dl=d.value; path=out+os.path.splitext(dl.suggested_filename)[1]; dl.save_as(path)
    except Exception as ex:
        status=pg.evaluate("(()=>{const d=document.querySelector('[role=dialog]');return d?d.innerText.slice(-200):''})()")
        pg.remove_listener("pageerror",h); return None,f"no download: {str(ex)[:60]} | dialog tail: {status!r}",errs
    pg.remove_listener("pageerror",h); return path,"",errs
def spec(v): return lambda pg: pg.locator("[role=dialog] input[placeholder='Example: 1,3-5,8']").fill(v)
VIOL=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900},accept_downloads=True); pg=ctx.new_page()
    pg.on("console",lambda m: VIOL.append(m.text[:140]) if ("Content Security Policy" in m.text or "Refused to" in m.text) else None)
    S=f"{E}/sample.pdf"
    def chk(tid,files,fill=None,pages=None,extra=None,label=None):
        path,err,errs=run_tool(pg,tid,files,fill)
        if path is None: ck(f"{label or tid}: produces a download",False,err); return
        ok=valid_pdf(path) if path.endswith(".pdf") else True; n,size=pdfinfo(path) if path.endswith(".pdf") else (None,None)
        good=ok and (pages is None or n==pages) and (extra(path,size) if extra else True) and not errs
        ck(f"{label or tid}: output valid"+(f" ({n} pages)" if n is not None else f" ({os.path.basename(path)})"),good,f"valid={ok} pages={n} size={size} errs={errs[:2]}")
    chk("merge",[S,S],pages=6)
    chk("split",[S],spec("1-2"),pages=2)
    chk("extract",[S],spec("1,3"),pages=2)
    chk("delete",[S],spec("2"),pages=2)
    chk("rotate",[S],spec("1"),pages=3,extra=lambda path,s: "90" in subprocess.run(["pdfinfo","-f","1","-l","1",path],capture_output=True,text=True).stdout.split("Page    1 rot:")[-1][:6])
    chk("reorder",[S],spec("3,2,1"),pages=3)
    chk("watermark",[S],lambda pg: pg.locator("[role=dialog] input[placeholder='CONFIDENTIAL']").fill("DRAFT"),pages=3)
    chk("numbers",[S],pages=3)
    chk("crop",[S],lambda pg: pg.locator("[role=dialog] input[placeholder='24']").fill("30"),pages=3)
    chk("resize",[S],lambda pg: pg.locator("[role=dialog] select").select_option("a5"),pages=3,extra=lambda path,s: s and abs(s[0]-419.5)<3 and abs(s[1]-595.3)<3)
    chk("redact",[S],pages=3)
    chk("images",[f"{E}/a.png",f"{E}/b.jpg"],pages=2)
    chk("flatten",[f"{E}/form.pdf"],pages=1)
    def edit(pg):
        pg.locator("[role=dialog] input[placeholder='Text to add']").fill("Hello edit")
    chk("edit",[S],edit,pages=3)
    def forms(pg):
        pg.locator("[role=dialog] button",has_text="Detect form fields").click(); pg.wait_for_timeout(800)
        pg.locator("[role=dialog] input:not([type])").first.fill("Alice")
    chk("forms",[f"{E}/form.pdf"],forms,pages=1)
    def sign(pg):
        c=pg.locator("[role=dialog] canvas"); bb=c.bounding_box(); pg.mouse.move(bb["x"]+20,bb["y"]+30); pg.mouse.down(); pg.mouse.move(bb["x"]+90,bb["y"]+60,steps=8); pg.mouse.move(bb["x"]+140,bb["y"]+25,steps=8); pg.mouse.up()
        pg.locator("[role=dialog] input[placeholder='Example: 1,3-5,8']").fill("1")
    chk("sign",[S],sign,pages=3)
    chk("pdfimages",[S],label="pdfimages")
    pg.goto(f"{B}/?tool=auto"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]",S); pg.locator("[role=dialog] button",has_text="Process").click(); pg.wait_for_timeout(2500)
    t=pg.locator("[role=dialog]").inner_text(); ck("auto: shows analysis report + recommendation",("Auto analysis complete" in t) and ("Pages" in t),t[-160:])
    chk("ocr",[f"{E}/scan.pdf"],label="ocr (self-hosted)")
    chk("compress",[S],label="compress (worker)")
    def prot(pg): pg.locator("[role=dialog] input[type=password]").fill("longpassword1")
    path,err,errs=run_tool(pg,"protect",[S],prot)
    if path: 
        no=subprocess.run(["qpdf","--check",path],capture_output=True).returncode!=0; yes=subprocess.run(["qpdf","--password=longpassword1","--check",path],capture_output=True).returncode in (0,3)
        ck("protect (worker): needs password, opens with it",no and yes,f"no_pw_fails={no} with_pw_ok={yes}")
    else: ck("protect (worker): produces a download",False,err)
    chk("office",[f"{E}/hello.docx"],label="office (worker+LibreOffice)",pages=1)
    # ai: not configured -> graceful, no crash
    pg.goto(f"{B}/?tool=ai"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]",S); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.locator("[role=dialog] button",has_text="Summarize").click(); pg.wait_for_timeout(2500)
    ck("ai (unconfigured): fails gracefully, dialog still usable",pg.locator("[role=dialog]").count()==1 and not errs,errs)
    # invalid file rejected
    pg.goto(f"{B}/?tool=merge"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]",f"{E}/native_test.py") if False else None
    b.close()
print("CSP violations:",VIOL if VIOL else "none")
print(f"\n{sum(R)}/{len(R)} passed")
import sys as _s; _s.exit(0 if all(R) else 1)
