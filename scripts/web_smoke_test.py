#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
import re, sys, json

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
required=[
    WEB/"index.html", WEB/"styles.css", WEB/"storage.js", WEB/"app.js",
    WEB/"original_bank.js", WEB/"robots.txt", WEB/".nojekyll"
]
for p in required:
    if not p.is_file():
        print("Missing:",p,file=sys.stderr);raise SystemExit(1)

class P(HTMLParser):
    def __init__(self): super().__init__();self.ids=set()
    def handle_starttag(self,tag,attrs):
        for k,v in attrs:
            if k=="id" and v:self.ids.add(v)

html=(WEB/"index.html").read_text(encoding="utf-8")
if 'name="robots" content="noindex, nofollow, noarchive"' not in html:
    print("noindex metadata is missing", file=sys.stderr); raise SystemExit(1)
if "実際の入試の声質・速度・間を完全再現するものではありません" not in html:
    print("required synthetic-audio disclaimer is missing", file=sys.stderr); raise SystemExit(1)
if html.find('src="storage.js"') < 0 or html.find('src="app.js"') < 0 or html.find('src="storage.js"') > html.find('src="app.js"'):
    print("storage.js must be loaded before app.js", file=sys.stderr); raise SystemExit(1)
p=P();p.feed(html)
js=(WEB/"app.js").read_text(encoding="utf-8")
refs=set(re.findall(r'els\.([A-Za-z0-9_]+)',js))
missing=sorted(refs-p.ids)
if missing:
    print("DOM ids missing:",", ".join(missing),file=sys.stderr);raise SystemExit(1)

for required_id in ["packInput", "exportProgressBtn", "progressImportInput", "rateSlider"]:
    if required_id not in p.ids:
        print("Required public control missing:", required_id, file=sys.stderr); raise SystemExit(1)

storage=(WEB/"storage.js").read_text(encoding="utf-8")
for invariant in ["waseshibu-listening-progress", "waseshibu-step-progress-v1", "schemaVersion"]:
    if invariant not in storage:
        print("Storage compatibility invariant missing:", invariant, file=sys.stderr); raise SystemExit(1)

bankjs=(WEB/"original_bank.js").read_text(encoding="utf-8")
m=re.match(r"window\.WASESHIBU_ORIGINAL_BANK\s*=\s*(\[.*\]);\s*$",bankjs,re.S)
if not m:
    print("Original bank wrapper invalid",file=sys.stderr);raise SystemExit(1)
bank=json.loads(m.group(1))
drill_counts={}
retention_counts={}
for x in bank:
    target = retention_counts if x.get("retentionOnly") else drill_counts
    target[x["tag"]] = target.get(x["tag"],0)+1
for tag in ["NEXT","CHANGE","NOT","TIME","MONEY","PLACE","REASON","PURPOSE","DETAIL","TRUEFALSE","MAIN"]:
    if drill_counts.get(tag,0)<7:
        print(f"Need at least 7 drill items for {tag}",file=sys.stderr);raise SystemExit(1)
    if retention_counts.get(tag,0)<3:
        print(f"Need at least 3 retention-only items for {tag}",file=sys.stderr);raise SystemExit(1)
print("PASS: web smoke test; DOM references exist; original bank has",len(bank),"items with separate drill/retention pools.")
