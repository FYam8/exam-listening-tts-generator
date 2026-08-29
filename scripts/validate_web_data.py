from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROLES = {"male", "female", "narrator", "man", "woman"}
DIFFICULTIES = {"A", "B", "C"}


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return [f"{path}: invalid JSON: {exc}"]

    if not isinstance(data, dict):
        return [f"{path}: top level must be an object"]
    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        return [f"{path}: questions must be a non-empty list"]

    for i, q in enumerate(questions, 1):
        prefix = f"{path}: question {i}"
        if not isinstance(q, dict):
            errors.append(f"{prefix}: must be an object")
            continue
        dialogue = q.get("dialogue")
        if not isinstance(dialogue, list) or not dialogue:
            errors.append(f"{prefix}: dialogue must be a non-empty list")
        else:
            for j, turn in enumerate(dialogue, 1):
                if not isinstance(turn, dict):
                    errors.append(f"{prefix}: dialogue {j} must be an object")
                    continue
                if str(turn.get("role", "")).lower() not in ROLES:
                    errors.append(f"{prefix}: dialogue {j} has invalid role")
                if not isinstance(turn.get("text"), str) or not turn["text"].strip():
                    errors.append(f"{prefix}: dialogue {j} text is empty")
        if not isinstance(q.get("question"), str) or not q["question"].strip():
            errors.append(f"{prefix}: question text is empty")
        choices = q.get("choices")
        if not isinstance(choices, list) or not 2 <= len(choices) <= 6:
            errors.append(f"{prefix}: choices must contain 2 to 6 items")
        correct = q.get("correct")
        if (
            not isinstance(correct, int)
            or isinstance(correct, bool)
            or not isinstance(choices, list)
            or not 0 <= correct < len(choices)
        ):
            errors.append(f"{prefix}: correct must be a valid zero-based choice index")
        diff = str(q.get("difficulty", "A")).upper()
        if diff not in DIFFICULTIES:
            errors.append(f"{prefix}: difficulty must be A, B, or C")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        default=[
            Path("web/data/demo.json"),
            Path("web/examples/local-set-template.json"),
        ],
    )
    args = parser.parse_args()
    errors: list[str] = []
    for path in args.paths:
        errors.extend(validate_file(path))
    if errors:
        print("Web data validation failed:", file=sys.stderr)
        for e in errors:
            print(f"- {e}", file=sys.stderr)
        return 1
    print(f"Web data validation passed: {len(args.paths)} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
