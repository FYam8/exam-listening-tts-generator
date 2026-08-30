#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
import re, sys, json

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
required=[WEB/"index.html",WEB/"styles.css",WEB/"config.js",WEB/"storage.js",WEB/"app.js",WEB/"original_bank.js"]
for p in required:
    if not p.is_file():
        print("Missing:",p,file=sys.stderr);raise SystemExit(1)

class P(HTMLParser):
    def __init__(self): super().__init__();self.ids=set()
    def handle_starttag(self,tag,attrs):
        for k,v in attrs:
            if k=="id" and v:self.ids.add(v)

html=(WEB/"index.html").read_text(encoding="utf-8")
for marker in [
    'name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
    "非公式の合成音声学習ツールです。",
    "実際の入試の声質・速度・間を完全再現するものではありません。",
    'id="packInput"',
    'id="exportProgressBtn"',
    'id="progressImportInput"',
    'id="rateSlider"',
    "なぜ2023年度から？",
    "Man（男性）",
    "Woman（女性）",
    "6割ライン",
    "安定目標",
    'id="remainingDays"',
]:
    if marker not in html:
        print("Missing required page marker:", marker, file=sys.stderr); raise SystemExit(1)
for dependency in ['src="storage.js"', 'src="voice_profiles.js"', 'src="study_plan.js"']:
    if html.find(dependency) < 0 or html.find(dependency) > html.find('src="app.js"'):
        print(f"{dependency} must be loaded before app.js", file=sys.stderr); raise SystemExit(1)
if html.find('class="card progress-transfer-card"') < html.find('id="voiceStatus"'):
    print("Progress import/export card must remain below the audio settings", file=sys.stderr); raise SystemExit(1)
p=P();p.feed(html)
js=(WEB/"app.js").read_text(encoding="utf-8")
refs=set(re.findall(r'els\.([A-Za-z0-9_]+)',js))
missing=sorted(refs-p.ids)
if missing:
    print("DOM ids missing:",", ".join(missing),file=sys.stderr);raise SystemExit(1)

bankjs=(WEB/"original_bank.js").read_text(encoding="utf-8")
m=re.match(r"window\.LISTENING_ORIGINAL_BANK\s*=\s*(\[.*\]);\s*$",bankjs,re.S)
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
