#!/usr/bin/env python3
"""Fail fast on files that should not enter the public repository.

This is a guardrail, not a substitute for a human copyright review.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

FORBIDDEN_SUFFIXES = {
    ".mp3", ".wav", ".m4a", ".ogg", ".flac",
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff",
}
IGNORED_PARTS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".cache",
}
TEXT_SUFFIXES = {".py", ".md", ".txt", ".json", ".jsonl", ".yml", ".yaml", ".toml", ".bat", ".command"}
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
]
BASE64_BLOB = re.compile(r"(?:[A-Za-z0-9+/]{2000,}={0,2})")
YEAR_SPECIFIC_MEDIA = re.compile(r"(?i)20\d{2}.*(?:listening|script|audio)|(?:listening|script|audio).*20\d{2}")
PUBLIC_SCRIPT_ALLOWLIST = {"examples/sample_script.json"}


def candidate_files(root: Path) -> list[Path]:
    git_dir = root / ".git"
    if git_dir.is_dir():
        result = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=root,
            check=True,
            capture_output=True,
        )
        names = [name for name in result.stdout.decode("utf-8", "surrogateescape").split("\0") if name]
        return [root / name for name in names if (root / name).is_file()]
    return [
        path for path in root.rglob("*")
        if path.is_file() and not any(part in IGNORED_PARTS for part in path.relative_to(root).parts)
    ]


def looks_like_listening_script(value: object) -> bool:
    if isinstance(value, dict):
        keys = set(value)
        if {"role", "text"} <= keys or "questions" in keys:
            return True
        if "items" in keys and isinstance(value.get("items"), list):
            return True
        return any(looks_like_listening_script(child) for child in value.values())
    if isinstance(value, list):
        return any(looks_like_listening_script(child) for child in value)
    return False


def audit(root: Path) -> list[str]:
    errors: list[str] = []
    for path in candidate_files(root):
        relative = path.relative_to(root)
        lower_parts = [part.lower() for part in relative.parts]
        is_private_placeholder = relative.as_posix() == "scripts/private/.gitkeep"
        if not is_private_placeholder and (
            "private" in lower_parts
            or any(part.endswith((".private.json", ".private.jsonl")) for part in lower_parts)
        ):
            errors.append(f"private path must not be published: {relative}")
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            errors.append(f"audio/document/image file is forbidden: {relative}")
        if YEAR_SPECIFIC_MEDIA.search(path.name):
            errors.append(f"year-specific script/audio filename needs manual removal: {relative}")
        if path.suffix.lower() not in TEXT_SUFFIXES or path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"unexpected binary content: {relative}")
            continue
        if BASE64_BLOB.search(text):
            errors.append(f"large embedded base64 blob detected: {relative}")
        if path.suffix.lower() == ".json" and relative.as_posix() not in PUBLIC_SCRIPT_ALLOWLIST:
            try:
                json_value = json.loads(text)
            except json.JSONDecodeError:
                json_value = None
            if looks_like_listening_script(json_value):
                errors.append(f"non-allowlisted listening script detected: {relative}")
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors.append(f"possible secret detected: {relative}")
                break
        if ("ahm7x" + "makki.com") in text:
            errors.append(f"legacy third-party TTS endpoint detected: {relative}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit public repository contents.")
    parser.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    args = parser.parse_args()
    root = args.root.resolve()
    errors = audit(root)
    if errors:
        print("Publication audit failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Publication audit passed: {len(candidate_files(root))} file(s) checked.")
    print("A human must still review staged text for copyrighted source material.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
