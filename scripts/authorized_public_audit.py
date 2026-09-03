#!/usr/bin/env python3
from pathlib import Path
import base64, json, re, sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

def fail(msg):
    print("AUTHORIZED PUBLIC AUDIT FAILED:", msg, file=sys.stderr)
    raise SystemExit(1)

index = (WEB/"index.html").read_text(encoding="utf-8")
robots = (WEB/"robots.txt").read_text(encoding="utf-8")
data_files = list(WEB.glob("content-*.js"))
if len(data_files) != 1:
    fail(f"expected exactly one encoded content file, found {len(data_files)}")
data_file = data_files[0]

# noindex must be crawlable: blocking "/" would prevent compliant engines from seeing the meta tag.
required_meta = [
    'name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
    'name="googlebot" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
    'name="bingbot" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
]
for marker in required_meta:
    if marker not in index:
        fail(f"missing noindex meta: {marker}")

lines = [ln.strip() for ln in robots.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
if "User-agent: *" not in lines:
    fail("robots.txt must define User-agent: *")
if "Disallow: /" in lines:
    fail("robots.txt must not block the whole site; crawler needs to see the noindex meta")
if "Allow: /" not in lines:
    fail("robots.txt should allow the page itself to be crawled")
if f"Disallow: /{data_file.name}" not in lines:
    fail("encoded content asset must be disallowed in robots.txt")
if (WEB/"sitemap.xml").exists():
    fail("sitemap.xml should not exist in the noindex build")

# Decode and structurally verify embedded content.
text = data_file.read_text(encoding="utf-8")
m = re.fullmatch(r'window\.LISTENING_BUNDLED_PACK_B64="([A-Za-z0-9+/=]+)";\s*', text)
if not m:
    fail("encoded content wrapper is invalid")
try:
    raw = base64.b64decode(m.group(1), validate=True)
    pack = json.loads(raw.decode("utf-8"))
except Exception as exc:
    fail(f"cannot decode embedded pack: {exc}")

years = pack.get("years")
if not isinstance(years, list) or [int(y.get("year")) for y in years] != list(range(2019, 2027)):
    fail("embedded pack must contain 2019–2026")
if sum(sum(len(s.get("questions", [])) for s in y.get("stimuli", [])) for y in years) != 80:
    fail("embedded pack must contain exactly 80 listening questions")
for y in years:
    if sum(len(s.get("questions", [])) for s in y.get("stimuli", [])) != 10:
        fail(f"{y.get('year')}: expected 10 questions")

# Public source must not reveal distinctive project/school identifiers.
# Construct markers so the audit source itself does not contain the searchable strings.
legacy_name = bytes([119,97,115,101,115,104,105,98,117]).decode("ascii")
english_school_name = bytes([87,97,115,101,100,97,32,83,104,105,98,117,121,97]).decode("ascii")
distinctive = [
    "早稲" + "渋",
    "早稲田" + "渋谷",
    english_school_name,
    legacy_name,
]
scan_ext = {".html",".js",".json",".txt",".md",".css",".py",".yml",".yaml"}
for p in ROOT.rglob("*"):
    if not p.is_file() or p == data_file or "__pycache__" in p.parts:
        continue
    rel = str(p.relative_to(ROOT))
    lowname = p.name.lower()
    for marker in distinctive:
        if marker.lower() in lowname:
            fail(f"distinctive identifier found in filename: {rel}")
    if p.suffix.lower() not in scan_ext and p.name != ".gitignore":
        continue
    body = p.read_text(encoding="utf-8", errors="ignore")
    for marker in distinctive:
        if marker.lower() in body.lower():
            fail(f"distinctive identifier found in searchable source: {rel}")

# Official content must not appear as searchable plaintext outside the encoded asset.
# Use long 12-word prefixes to avoid false positives on generic stems such as "What is the main purpose...".
official_prefixes = set()
for y in years:
    for s in y.get("stimuli", []):
        chunks = []
        chunks.extend(t.get("text","") for t in s.get("turns", []))
        if s.get("passage"):
            chunks.append(s["passage"])
        for q in s.get("questions", []):
            chunks.append(q.get("text",""))
            chunks.extend(q.get("choices", []))
        for chunk in chunks:
            words = re.findall(r"[A-Za-z']+", chunk)
            if len(words) >= 12:
                official_prefixes.add(" ".join(words[:12]).lower())

for p in ROOT.rglob("*"):
    if not p.is_file() or p == data_file or "__pycache__" in p.parts:
        continue
    if p.suffix.lower() not in scan_ext:
        continue
    body = p.read_text(encoding="utf-8", errors="ignore").lower()
    for prefix in official_prefixes:
        if prefix in body:
            fail(f"searchable official-text phrase found in {p.relative_to(ROOT)}")

if (ROOT/"private-content").exists():
    fail("private-content directory must not exist in authorized public build")
if any(ROOT.rglob("*.private.json")):
    fail("private JSON must not exist in authorized public build")

# Ensure script order: encoded pack before config, config before app.
encoded_match = re.search(rf'<script src="{re.escape(data_file.name)}(?:\?[^"]*)?"></script>', index)
config_match = re.search(r'src="config\.js(?:\?[^"]*)?"', index)
app_match = re.search(r'src="app\.js(?:\?[^"]*)?"', index)
if not encoded_match:
    fail("encoded content script missing from index.html")
if not config_match or not app_match or not (encoded_match.start() < config_match.start() < app_match.start()):
    fail("script order must be encoded content -> config -> app")

print("PASS: noindex/robots interaction, generic source naming, encoded 80-question pack, and plaintext-leak checks verified.")
