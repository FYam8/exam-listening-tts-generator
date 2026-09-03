
from playwright.sync_api import sync_playwright
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]; WEB=ROOT/"web"
html=(WEB/"index.html").read_text()
css=(WEB/"styles.css").read_text()
html=re.sub(r'<link[^>]+href="styles\.css(?:\?[^"]*)?"[^>]*>',"<style>"+css+"</style>",html)
def repl(m):
    src=m.group(1).split("?")[0]; p=WEB/src
    if p.exists(): return "<script>"+p.read_text()+"</script>"
    return m.group(0)
html=re.sub(r'<script\s+src="([^"]+)"\s*></script>',repl,html)
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path="/usr/bin/chromium",args=["--no-sandbox"])
    pg=b.new_page()
    errs=[]; logs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:logs.append(m.text))
    pg.set_content(html,wait_until="load")
    pg.wait_for_timeout(500)
    print("badge",pg.locator("#buildBadge").inner_text())
    print("today",pg.locator("#todayTask").inner_text())
    print("data",pg.locator("#dataStatus").inner_text())
    print("errors",errs)
    print("logs",logs[-20:])
    b.close()
