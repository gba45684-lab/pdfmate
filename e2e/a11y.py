"""Accessibility audit (axe-core, WCAG 2.0/2.1 A+AA + best practices) of every screen in both apps. Fails on serious/critical violations."""
import os, sys, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AXE = open(os.path.join(ROOT, "node_modules/axe-core/axe.min.js")).read()
APP, NATIVE = "http://localhost:3100", "http://localhost:8200/index.html"
FAIL = []; SUMMARY = []
def audit(pg, label):
    pg.wait_for_timeout(1000)  # let fade-in animations finish (axe would measure blended colours)
    pg.add_script_tag(content=AXE)
    res = pg.evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,t:v.nodes.slice(0,6).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\\n').slice(1,3).join(' ').slice(0,110)+' || '+n.html.slice(0,110))})))")
    bad = [v for v in res if v["impact"] in ("serious", "critical")]; minor = [v for v in res if v not in bad]
    SUMMARY.append((label, len(bad), len(minor)))
    for v in res: print(f"  [{label}] {v['impact']:9} {v['id']} x{v['n']}: {v['help']}\n      e.g. "+"\n          ".join(v['t'][:6])+f"")
    if bad: FAIL.append(label)
with sync_playwright() as p:
    b = p.chromium.launch()
    for vp, w, h in (("desktop", 1280, 900), ("mobile", 390, 844)):
        ctx = b.new_context(viewport={"width": w, "height": h}, bypass_csp=True); pg = ctx.new_page()
        pg.goto(APP + "/"); pg.wait_for_selector("h1"); pg.wait_for_timeout(500); audit(pg, f"app home ({vp})")
        pg.goto(APP + "/?tool=merge"); pg.wait_for_selector("[role=dialog]"); pg.set_input_files("[role=dialog] input[type=file]", ["/tmp/e2e/sample.pdf", "/tmp/e2e/sample.pdf"]); pg.wait_for_timeout(300); audit(pg, f"app tool dialog ({vp})")
        pg.goto(APP + "/?tool=sign"); pg.wait_for_selector("[role=dialog]"); audit(pg, f"app sign dialog ({vp})")
        pg.goto(APP + "/auth"); pg.wait_for_selector("h1"); audit(pg, f"app sign-in ({vp})")
        pg.goto(APP + "/privacy"); pg.wait_for_selector("h1"); audit(pg, f"app privacy ({vp})")
        ctx.close()
        ctx = b.new_context(viewport={"width": w, "height": h}, bypass_csp=True); pg = ctx.new_page()
        pg.goto(NATIVE); pg.wait_for_selector("#qa .qb"); audit(pg, f"native onboarding ({vp})")
        pg.locator("[data-ob=skip]").click()
        audit(pg, f"native home ({vp})")
        for route, name in (("#/tool/images", "tool upload"), ("#/tool/merge", "hosted handoff"), ("#/files", "files"), ("#/account", "account")):
            pg.goto(NATIVE + route); pg.wait_for_selector("#v-app h1"); pg.wait_for_timeout(200); audit(pg, f"native {name} ({vp})")
        ctx.close()
    b.close()
print("\nSUMMARY (serious+critical / minor+moderate):")
for l, bad, minor in SUMMARY: print(f"  {'FAIL' if bad else 'ok  '} {l}: {bad} / {minor}")
sys.exit(1 if FAIL else 0)
