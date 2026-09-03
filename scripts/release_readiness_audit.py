#!/usr/bin/env python3
from pathlib import Path
import re, sys

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"

def fail(msg):
    print("RELEASE READINESS AUDIT FAILED:",msg,file=sys.stderr)
    raise SystemExit(1)

required=[
    "README.md","GITHUB_PUBLISHING.md","CHAT_HANDOFF.md",
    ".github/workflows/pages.yml","web/index.html","web/robots.txt","web/target_strategy.js",
    "scripts/publication_audit.py","scripts/authorized_public_audit.py",
    "scripts/web_smoke_test.py","scripts/storage_roundtrip_test.js",
    "scripts/study_plan_test.js","scripts/voice_assignment_test.js",
    "scripts/bundled_pack_runtime_test.js","scripts/transfer_practice_test.js",
    "scripts/cause_diagnostics_test.js","scripts/rediagnosis_ui_test.js","scripts/target_strategy_test.js","scripts/resume_checkpoint_test.js","scripts/today_flow_test.js","scripts/script_forward_test.js","scripts/exam_choice_ui_test.js","scripts/fresh_start_ui_test.js","scripts/all_choice_surfaces_test.js","scripts/e2e_state_guard_test.js","scripts/browser_e2e_test.py",
]
for rel in required:
    if not (ROOT/rel).exists(): fail(f"missing required release file: {rel}")

content=list(WEB.glob("content-*.js"))
if len(content)!=1: fail(f"expected one encoded content asset, found {len(content)}")
content_name=content[0].name

docs={n:(ROOT/n).read_text(encoding="utf-8") for n in ["README.md","GITHUB_PUBLISHING.md","CHAT_HANDOFF.md"]}
workflow=(ROOT/".github/workflows/pages.yml").read_text(encoding="utf-8")
robots=(WEB/"robots.txt").read_text(encoding="utf-8")
index=(WEB/"index.html").read_text(encoding="utf-8")

# Docs must not freeze a hashed content filename or old commit.
for name,body in docs.items():
    if re.search(r"content-[0-9a-f]{12}\.js",body):
        fail(f"{name} contains a fixed hashed content filename")
if re.search(r"Latest commit:\s*`?[0-9a-f]{40}",docs["CHAT_HANDOFF.md"],re.I):
    fail("CHAT_HANDOFF.md contains a stale fixed commit hash")

# Robots/noindex instructions must match the actual build.
if "Disallow: /" in [ln.strip() for ln in robots.splitlines()]:
    fail("actual robots.txt blocks the whole site")
if f"Disallow: /{content_name}" not in robots:
    fail("actual robots.txt does not name the current encoded asset")
for marker in [
    'name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
    'name="googlebot" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
    'name="bingbot" content="noindex,nofollow,noarchive,nosnippet,noimageindex"',
]:
    if marker not in index: fail(f"missing noindex marker: {marker}")
for name,body in docs.items():
    if "アクセス制御では" not in body and name!="CHAT_HANDOFF.md":
        fail(f"{name} must explain that noindex/robots are not access control")
if "project site" not in docs["GITHUB_PUBLISHING.md"]:
    fail("publishing guide must explain project-site robots.txt limitation")

# Canonical release checks must appear in README and publishing guide.
commands=[
    "python scripts/publication_audit.py",
    "python scripts/authorized_public_audit.py",
    "python scripts/release_readiness_audit.py",
    "python scripts/web_smoke_test.py",
    "node scripts/storage_roundtrip_test.js",
    "node scripts/study_plan_test.js",
    "node scripts/voice_assignment_test.js",
    "node scripts/bundled_pack_runtime_test.js",
    "node scripts/transfer_practice_test.js",
    "node scripts/cause_diagnostics_test.js",
    "node scripts/rediagnosis_ui_test.js",
    "node scripts/target_strategy_test.js",
    "node scripts/resume_checkpoint_test.js",
    "node scripts/today_flow_test.js",
    "node scripts/script_forward_test.js",
    "node scripts/exam_choice_ui_test.js",
    "node scripts/fresh_start_ui_test.js",
    "node scripts/all_choice_surfaces_test.js",
    "node scripts/e2e_state_guard_test.js",
    "python scripts/browser_e2e_test.py",
    "node --check web/config.js",
    "node --check web/storage.js",
    "node --check web/voice_profiles.js",
    "node --check web/study_plan.js",
    "node --check web/target_strategy.js",
    "node --check web/transfer_bank.js",
    "node --check web/app.js",
]
for docname in ["README.md","GITHUB_PUBLISHING.md","CHAT_HANDOFF.md"]:
    for cmd in commands:
        if cmd not in docs[docname]:
            fail(f"{docname} missing release command: {cmd}")

# CI must run the behavioral tests and syntax checks before deploy.
for marker in [
    "actions/setup-node@v4",
    'node-version: "20"',
    "python scripts/publication_audit.py",
    "python scripts/authorized_public_audit.py",
    "python scripts/release_readiness_audit.py",
    "python scripts/web_smoke_test.py",
    "node scripts/storage_roundtrip_test.js",
    "node scripts/study_plan_test.js",
    "node scripts/voice_assignment_test.js",
    "node scripts/bundled_pack_runtime_test.js",
    "node scripts/transfer_practice_test.js",
    "node scripts/cause_diagnostics_test.js",
    "node scripts/rediagnosis_ui_test.js",
    "node scripts/target_strategy_test.js",
    "node scripts/resume_checkpoint_test.js",
    "node scripts/today_flow_test.js",
    "node scripts/script_forward_test.js",
    "node scripts/exam_choice_ui_test.js",
    "node scripts/fresh_start_ui_test.js",
    "node scripts/all_choice_surfaces_test.js",
    "node scripts/e2e_state_guard_test.js",
    "python scripts/browser_e2e_test.py",
    "node --check web/config.js",
    "node --check web/storage.js",
    "node --check web/voice_profiles.js",
    "node --check web/study_plan.js",
    "node --check web/target_strategy.js",
    "node --check web/transfer_bank.js",
    "node --check web/app.js",
    "path: web",
]:
    if marker not in workflow: fail(f"workflow missing: {marker}")

print("PASS: release docs, workflow, noindex/robots guidance, current content asset, and canonical test list are consistent.")
