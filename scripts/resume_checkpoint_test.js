const assert=require("assert");
const fs=require("fs");
const WS=require("../web/storage.js");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

// Storage schema and merge behavior.
assert.ok(WS.CURRENT_SCHEMA>=6,"schema v6+ required for activeSession");
const def=WS.defaultProgress();
assert.strictEqual(def.activeSession,null,"default activeSession must be null");

const older={...WS.defaultProgress(),activeSession:{type:"exam",stage:"exam",year:2023,idx:1,updatedAt:"2026-08-30T10:00:00Z"}};
const newer={...WS.defaultProgress(),activeSession:{type:"rediagnosis",stage:"script-ready",year:2023,groupId:"x",groupQids:["q1"],updatedAt:"2026-08-30T11:00:00Z"}};
assert.strictEqual(WS.mergeProgress(older,newer).activeSession.stage,"script-ready","newer activeSession must win merge");
assert.strictEqual(WS.normalizeProgress({...def,activeSession:"bad"}).activeSession,null,"invalid activeSession must be discarded");

// Today button must prioritize exact active session before generic pending/remediation.
const nextTask=app.match(/function computeNextTask\(\)\{[\s\S]*?\n\}/);
assert.ok(nextTask,"computeNextTask missing");
assert.ok(nextTask[0].indexOf("activeSessionTask()") < nextTask[0].indexOf('state.progress.pending?.type==="drill-sequence"'),
  "active session must outrank generic pending logic");
assert.ok(app.includes('task.type==="resume-active-session"'),"Today button must restore active session");

// Exam checkpointing.
const startExam=app.match(/function startExam\([^)]*\)\{[\s\S]*?\n\}/);
const renderExam=app.match(/function renderExam\(\)\{[\s\S]*?\n\}/);
const renderExamQuestions=app.match(/function renderExamQuestions\(\)\{[\s\S]*?\n\}/);
const examNext=app.match(/function examNext\(\)\{[\s\S]*?\n\}/);
assert.ok(startExam&&startExam[0].includes("setActiveSession(examSessionSnapshot()"),"exam start checkpoint missing");
assert.ok(renderExamQuestions&&renderExamQuestions[0].includes("setActiveSession(examSessionSnapshot()"),"exam answer checkpoint missing");
assert.ok(examNext&&examNext[0].includes("setActiveSession(examSessionSnapshot()"),"exam next checkpoint missing");

// Rediagnosis: submitted answer must resume at script, never repeat answered question.
const submitRed=app.match(/function submitRediagnosis\(\)\{[\s\S]*?\n\}/);
const restore=app.match(/function restoreActiveSession\(\)\{[\s\S]*?\n\}/);
assert.ok(submitRed&&submitRed[0].includes('rediagnosisSessionSnapshot("script-ready")'),
  "submitted rediagnosis must checkpoint script-ready");
assert.ok(restore&&restore[0].includes('s.stage==="script-ready"')&&restore[0].includes("openScriptForCurrentGroup()"),
  "script-ready checkpoint must skip re-answer and open script");

// Script must remain the resume stage until Level 1 begins.
const openScript=app.match(/function openScriptForCurrentGroup\(\)\{[\s\S]*?\n\}/);
assert.ok(openScript&&openScript[0].includes("setActiveSession(scriptSessionSnapshot()"),"script checkpoint missing");

// Exact resume must carry the matching pending context as well as the visible item IDs.
for(const fnName of ["scriptSessionSnapshot","drillSessionSnapshot","transferSessionSnapshot"]){
  const m=app.match(new RegExp(`function ${fnName}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m&&m[0].includes("pendingContext:pendingCheckpoint()"),`${fnName} must checkpoint pending context`);
}
assert.ok(restore[0].includes("state.progress.pending=cloneCheckpointValue(s.pendingContext)"),
  "restore must reinstate the matching pending context");

// Level 1: selected bank IDs and submitted state must be preserved.
const drillSnap=app.match(/function drillSessionSnapshot\([^)]*\)\{[\s\S]*?\n\}/);
const submitDrill=app.match(/function submitDrill\(\)\{[\s\S]*?\n\}/);
assert.ok(drillSnap&&drillSnap[0].includes("itemIds:(d.items||[]).map(x=>x.id)"),"drill item IDs must be checkpointed");
assert.ok(submitDrill&&submitDrill[0].includes('drillSessionSnapshot("drill-submitted")'),
  "submitted drill must be marked as submitted");
assert.ok(restore[0].includes('s.stage==="drill-submitted"')&&restore[0].includes("advanceDrill()"),
  "Today resume after submitted drill must advance, not show same answered item");

// Level 2/3: exact selected items and submitted state must be preserved.
const transferSnap=app.match(/function transferSessionSnapshot\([^)]*\)\{[\s\S]*?\n\}/);
const submitTransfer=app.match(/function submitTransfer\(\)\{[\s\S]*?\n\}/);
assert.ok(transferSnap&&transferSnap[0].includes("itemIds:(t.items||[]).map(x=>x.id)"),"transfer item IDs must be checkpointed");
assert.ok(submitTransfer&&submitTransfer[0].includes('transferSessionSnapshot("transfer-submitted")'),
  "submitted transfer must be marked as submitted");
assert.ok(restore[0].includes('s.stage==="transfer-submitted"')&&restore[0].includes("advanceTransfer()"),
  "Today resume after submitted transfer must advance");

// Retention failure must route to mini drill rather than repeating the answered retention question.
const submitRetention=app.match(/function submitRetention\(\)\{[\s\S]*?\n\}/);
assert.ok(submitRetention&&submitRetention[0].includes('retentionSessionSnapshot("retention-failed")'),
  "failed retention must checkpoint next remediation action");
assert.ok(restore[0].includes('s.stage==="retention-failed"')&&restore[0].includes("startDrill(tag)"),
  "failed retention resume must start mini drill");


// Submitted screens must lock choices so a checkpoint cannot be downgraded by editing an already-scored answer.
assert.ok(app.includes("function lockChoiceButtons(container)"),"choice-lock helper missing");
assert.ok(submitRed[0].includes("lockChoiceButtons(els.rediagnosisQuestions)"),"submitted rediagnosis choices must lock");
assert.ok(submitDrill[0].includes("lockChoiceButtons(els.drillChoices)"),"submitted drill choices must lock");
assert.ok(submitTransfer[0].includes("lockChoiceButtons(els.transferQuestions)"),"submitted transfer choices must lock");
assert.ok(submitRetention[0].includes("lockChoiceButtons(els.retentionChoices)"),"submitted retention choices must lock");

// Dashboard / quit / reload safety.
const bind=app.match(/function bind\(\)\{[\s\S]*?\n\}/);
assert.ok(bind&&bind[0].includes("saveCurrentSessionCheckpoint()"),"dashboard/quit checkpoint call missing");
assert.ok(!app.includes("この年度の途中経過は保存されません"),"old unsaved-exam warning must be removed");
assert.ok(app.includes('window.addEventListener("beforeunload",()=>{')&&app.includes("saveCurrentSessionCheckpoint();"),
  "beforeunload checkpoint missing");

// Checkpoints contain IDs/state, not duplicated question text or scripts.
for(const fnName of ["examSessionSnapshot","rediagnosisSessionSnapshot","scriptSessionSnapshot","drillSessionSnapshot","transferSessionSnapshot","retentionSessionSnapshot"]){
  const m=app.match(new RegExp(`function ${fnName}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m,`${fnName} missing`);
  assert.ok(!m[0].includes("passage:"),`${fnName} must not copy passage content into progress`);
  assert.ok(!m[0].includes("turns:"),`${fnName} must not copy audio script content into progress`);
  assert.ok(!m[0].includes("choices:"),`${fnName} must not copy answer choices into progress`);
}

// Existing A60/B70/C75 target logic remains present.
for(const marker of ["remainingTargetWrongQids","completedRemediationQids","pendingAllowedForTarget"]){
  assert.ok(app.includes(marker),`target logic regression: ${marker}`);
}

console.log("PASS: exact resume checkpoints cover exam, rediagnosis→script, Level 1, Level 2/3, retention, dashboard quit, reload, and target-strategy coexistence.");
