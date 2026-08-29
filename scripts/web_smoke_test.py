import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

required = [
    WEB / "index.html",
    WEB / "styles.css",
    WEB / "app.js",
    WEB / "data" / "demo.json",
    WEB / "data" / "demo-data.js",
]

missing = [str(p.relative_to(ROOT)) for p in required if not p.is_file()]
if missing:
    print("Missing:", *missing, sep="\n- ", file=sys.stderr)
    raise SystemExit(1)


class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k == "id" and v:
                self.ids.add(v)


parser = IdParser()
parser.feed((WEB / "index.html").read_text(encoding="utf-8"))
needed_ids = {
    "homeView",
    "quizView",
    "resultView",
    "historyView",
    "startButton",
    "playButton",
    "choices",
    "nextButton",
    "scorePercent",
    "historyList",
    "fileInput",
}
missing_ids = needed_ids - parser.ids
if missing_ids:
    print("Missing DOM ids:", ", ".join(sorted(missing_ids)), file=sys.stderr)
    raise SystemExit(1)

print("Web smoke test passed.")
