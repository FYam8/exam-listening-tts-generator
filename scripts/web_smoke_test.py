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
    "年度カードを押すと",
    "Man（男性）",
    "Woman（女性）",
    "A</strong><span>60点",
    "B</strong><span>70点",
    "C</strong><span>75点",
    'id="targetGoalButtons"',
    'id="remainingDays"',
    'id="reviewView"',
    'id="reviewList"',
    'id="dashboardHistorySummary"',
    'id="openHistoryBtn"',
]:
    if marker not in html:
        print("Missing required page marker:", marker, file=sys.stderr); raise SystemExit(1)
app_match=re.search(r'src="app\.js(?:\?[^"]*)?"',html)
if not app_match:
    print("app.js script tag missing",file=sys.stderr); raise SystemExit(1)
for dependency in ["storage.js","voice_profiles.js","study_plan.js","target_strategy.js"]:
    dep_match=re.search(rf'src="{re.escape(dependency)}(?:\?[^"]*)?"',html)
    if not dep_match or dep_match.start()>app_match.start():
        print(f"{dependency} must be loaded before app.js", file=sys.stderr); raise SystemExit(1)
audio_pos=html.find('id="voiceStatus"')
history_pos=html.find('class="card progress-transfer-card"')
reset_pos=html.find('id="resetProgressBtn"')
data_pos=html.find('class="card data-card"')
if not (audio_pos < history_pos < reset_pos < data_pos):
    print("Dashboard order must be Audio -> History/Backup -> Reset -> Past-question Data", file=sys.stderr); raise SystemExit(1)
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
