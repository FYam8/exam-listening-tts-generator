#!/usr/bin/env python3
"""Fail closed when material unsuitable for the public repository is present."""

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
IGNORED_PARTS = {".git", "__pycache__", ".venv", "venv", "node_modules"}
FORBIDDEN_DIRS = {"private-content"}
FORBIDDEN_SUFFIXES = {
    ".pdf", ".doc", ".docx", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".zip", ".7z", ".tar",
    ".gz", ".pem", ".key", ".p12", ".pfx",
}
FORBIDDEN_NAMES = {".env", "credentials.json", "secrets.json"}
TEXT_SUFFIXES = {".html", ".js", ".json", ".txt", ".md", ".css", ".py", ".yml", ".yaml", ".bat", ".command"}
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"(?i)(?:api[_-]?key|secret|access[_-]?token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
]
BASE64_BLOCK = re.compile(r"[A-Za-z0-9+/]{1000,}={0,2}")


def candidates():
    try:
        out = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.splitlines()
        if out:
            return [ROOT / line for line in out if (ROOT / line).is_file()]
    except (OSError, subprocess.CalledProcessError):
        pass
    return [p for p in ROOT.rglob("*") if p.is_file() and not (set(p.relative_to(ROOT).parts) & IGNORED_PARTS)]


problems = []
encoded_assets = []
files = candidates()
for path in files:
    rel = path.relative_to(ROOT)
    lower_parts = {part.lower() for part in rel.parts}
    if lower_parts & FORBIDDEN_DIRS:
        problems.append(f"forbidden directory: {rel}")
    if path.name.lower().endswith(".private.json"):
        problems.append(f"private JSON: {rel}")
    if path.suffix.lower() in FORBIDDEN_SUFFIXES:
        problems.append(f"forbidden file type: {rel}")
    if path.name.lower() in FORBIDDEN_NAMES or path.name.lower().startswith(".env."):
        problems.append(f"credential-like filename: {rel}")
    if re.fullmatch(r"content-[0-9a-f]{12}\.js", path.name):
        encoded_assets.append(path)
    if path == SELF or (path.suffix.lower() not in TEXT_SUFFIXES and path.name != ".gitignore"):
        continue
    body = path.read_text(encoding="utf-8", errors="ignore")
    for pattern in SECRET_PATTERNS:
        if pattern.search(body):
            problems.append(f"possible secret in {rel}")
    if BASE64_BLOCK.search(body) and not re.fullmatch(r"content-[0-9a-f]{12}\.js", path.name):
        problems.append(f"unexpected large Base64 block in {rel}")

if len(encoded_assets) != 1:
    problems.append(f"expected exactly one audited encoded content asset, found {len(encoded_assets)}")

if problems:
    print("PUBLICATION AUDIT FAILED", file=sys.stderr)
    for problem in sorted(set(problems)):
        print("-", problem, file=sys.stderr)
    raise SystemExit(1)

print(f"PASS: publication audit checked {len(files)} public candidate files.")
print("Authorized encoded content is verified separately by authorized_public_audit.py.")
