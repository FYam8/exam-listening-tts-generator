const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

// Root-cause guard: an already-opened script checkpoint must not always restore the same script screen.
const active=app.match(/function activeSessionTask\(\)\{[\s\S]*?\n\}/);
const restore=app.match(/function restoreActiveSession\(\)\{[\s\S]*?\n\}/);
const advance=app.match(/function advanceFromScriptCheckpoint\(\)\{[\s\S]*?\n\}/);
const hydrate=app.match(/function hydrateScriptCheckpoint\(s\)\{[\s\S]*?\n\}/);
const missing=app.match(/function scriptCheckpointMissingCauses\(s\)\{[\s\S]*?\n\}/);

assert.ok(active&&restore&&advance&&hydrate&&missing,"script checkpoint forward functions missing");
assert.ok(active[0].includes("スクリプト確認済み → 次の類題へ"),
  "dashboard must say that an already-opened script advances to the next drill");
assert.ok(restore[0].includes("return advanceFromScriptCheckpoint()"),
  "script activeSession must use forward resolver, not blindly restore script");
assert.ok(advance[0].includes("startDrillsFromScript()"),
  "resolved script checkpoint must advance directly to Level 1");
assert.ok(!advance[0].includes('showView("scriptView");renderScript();return true;\n  }\n  startDrillsFromScript') || advance[0].includes("if(missing.length)"),
  "script may reopen only for unresolved mandatory input");

// Persistent rediagnosis miss still cannot bypass required cause selection.
assert.ok(advance[0].includes("if(missing.length)"),"mandatory cause branch missing");
assert.ok(advance[0].includes('showView("scriptView");renderScript()'),
  "missing cause must reopen script/cause screen");
assert.ok(advance[0].includes("ミス原因を1つ選んでから類題へ"),
  "missing-cause guidance missing");

// Dashboard inspection must not mutate pending state merely by rendering.
assert.ok(!missing[0].includes("state.progress.pending="),
  "scriptCheckpointMissingCauses must be side-effect free");
assert.ok(hydrate[0].includes("state.progress.pending=cloneCheckpointValue(s.pendingContext)"),
  "pending context must hydrate only when actually advancing/restoring");

// First transition from submitted rediagnosis still shows script once.
assert.ok(restore[0].includes('s.stage==="script-ready"')&&restore[0].includes("openScriptForCurrentGroup()"),
  "submitted rediagnosis must still show script practice once before skipping it on a later Today click");

// Script CTA wording must be explicit.
assert.ok(html.includes("スクリプト確認完了 → オリジナル類題へ"),
  "script CTA must clearly indicate completion then next drill");
const renderScript=app.match(/function renderScript\(\)\{[\s\S]*?\n\}/);
assert.ok(renderScript&&renderScript[0].includes("ミス原因を選んで → オリジナル類題へ"),
  "script CTA must explain required cause input when blocked");
assert.ok(renderScript&&renderScript[0].includes("スクリプト確認完了 → オリジナル類題へ"),
  "script CTA must explain normal forward action");

// v15 same-click Today chaining and v14 exact checkpoint safeguards remain.
const launch=app.match(/function launchTodayLearning\(\)\{[\s\S]*?\n\}/);
assert.ok(launch&&launch[0].includes("computeNextTask()"),"Today live recomputation regressed");
assert.ok(launch&&launch[0].includes("for(let guard=0;guard<12;guard++)"),"Today bounded chaining regressed");
for(const marker of [
  'rediagnosisSessionSnapshot("script-ready")',
  'drillSessionSnapshot("drill-submitted")',
  'transferSessionSnapshot("transfer-submitted")',
  "pendingContext:pendingCheckpoint()",
  "lockChoiceButtons(els.drillChoices)"
]){
  assert.ok(app.includes(marker),`resume safeguard regressed: ${marker}`);
}

console.log("PASS: script checkpoint is no longer a sticky dead-end; Today advances to Level 1 after one script visit, while mandatory cause input still blocks correctly.");
