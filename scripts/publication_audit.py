"""Guard the files that may enter the public GitHub repository.

This is a technical guardrail. A human copyright review is still required.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IGNORED_PARTS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".cache",
}
FORBIDDEN_PARTS = {"private-content", "source-materials"}
FORBIDDEN_SUFFIXES = {
    ".private.json",
    ".pdf",
    ".doc",
    ".docx",
    ".mp3",
    ".wav",
    ".m4a",
    ".ogg",
    ".flac",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".tif",
    ".tiff",
    ".webp",
    ".svg",
    ".zip",
}
TEXT_SUFFIXES = {
    ".py",
    ".js",
    ".html",
    ".css",
    ".json",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".bat",
    ".command",
}
PRIVATE_DATA_MARKERS = (
    '"sourceType":"user-provided-official-materials"',
    '"sourceType": "user-provided-official-materials"',
    "DO NOT PUBLISH. Built from the user's lawfully supplied past-exam",
)
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(
        r"(?i)(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"
    ),
)
BASE64_BLOB = re.compile(r"(?:[A-Za-z0-9+/]{2000,}={0,2})")


def candidate_files() -> list[Path]:
    if (ROOT / ".git").is_dir():
        result = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        names = [
            name
            for name in result.stdout.decode("utf-8", "surrogateescape").split("\0")
            if name
        ]
        return [ROOT / name for name in names if (ROOT / name).is_file()]
    return [
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and not any(part in IGNORED_PARTS for part in path.relative_to(ROOT).parts)
    ]


def audit() -> list[str]:
    problems: list[str] = []
    for path in candidate_files():
        relative = path.relative_to(ROOT)
        lower_parts = {part.lower() for part in relative.parts}
        lower_name = path.name.lower()

        if lower_parts & FORBIDDEN_PARTS:
            problems.append(f"private directory must not be published: {relative}")
        if lower_name.endswith(".private.json"):
            problems.append(f"private JSON must not be published: {relative}")
        elif path.suffix.lower() in FORBIDDEN_SUFFIXES:
            problems.append(f"forbidden document/media/archive: {relative}")

        if path.suffix.lower() not in TEXT_SUFFIXES or path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            problems.append(f"unexpected binary content: {relative}")
            continue

        if path.suffix.lower() in {".js", ".json", ".html"}:
            for marker in PRIVATE_DATA_MARKERS:
                if marker in text:
                    problems.append(f"private-pack content marker: {relative}")
                    break
        if BASE64_BLOB.search(text):
            problems.append(f"large embedded base64 data: {relative}")
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                problems.append(f"possible secret or private key: {relative}")
                break
    return problems


def main() -> int:
    problems = audit()
    if problems:
        print("PUBLICATION AUDIT FAILED", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print(f"PASS: publication audit checked {len(candidate_files())} public candidate files.")
    print("Manual review is still required for copyrighted source material.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
