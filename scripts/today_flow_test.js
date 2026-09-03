const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");

// Today button must always recompute the task at click time.
const launch=app.match(/function launchTodayLearning\(\)\{[\s\S]*?\n\}/);
assert.ok(launch,"launchTodayLearning missing");
assert.ok(launch[0].includes("const task=computeNextTask()"),"Today button must recompute live task");
assert.ok(!launch[0].includes("dataset.task"),"Today launcher must not depend on stale data-task");
assert.ok(launch[0].includes("for(let guard=0;guard<12;guard++)"),"Today launcher must use bounded chaining");
assert.ok(launch[0].includes('if(state.currentView!=="dashboardView")return'),
  "launcher must stop once a real interactive learning screen opens");
assert.ok(launch[0].includes('if(state.currentView==="dashboardView") continue'),
  "invalid/stale checkpoint recovery must recompute in the same click");

// Submitted checkpoints must advance instead of re-showing the answered item.
const restore=app.match(/function restoreActiveSession\(\)\{[\s\S]*?\n\}/);
assert.ok(restore,"restoreActiveSession missing");
assert.ok(restore[0].includes('s.stage==="script-ready"') && restore[0].includes("openScriptForCurrentGroup()"),
  "submitted rediagnosis must go to script");
assert.ok(restore[0].includes('s.stage==="drill-submitted"') && restore[0].includes("advanceDrill()"),
  "submitted Level 1 must advance");
assert.ok(restore[0].includes('s.stage==="transfer-submitted"') && restore[0].includes("advanceTransfer()"),
  "submitted Level 2/3 must advance");
assert.ok(restore[0].includes('s.stage==="retention-failed"') && restore[0].includes("startDrill(tag)"),
  "failed retention must go to remediation drill");

// If advancing a submitted checkpoint ends a stage and returns to dashboard,
// launchTodayLearning loops and starts the newly computed next task in the same click.
assert.ok(launch[0].includes("loop once more") || launch[0].includes("loop"),"auto-chain intent missing");

// Visible wording: no ambiguous 判定へ remains in runtime UI.
assert.ok(!app.includes('"判定へ"'),"ambiguous visible label 判定へ must be removed");
assert.ok(app.includes('"結果を確認して次へ"'),"clear result/next label missing");

// Dashboard button text should make resume intent visible.
const render=app.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/);
assert.ok(render && render[0].includes('"続きから次へ進む"'),"resume button wording missing");

console.log("PASS: Today button recomputes live state, chains through submitted transitions to the next interactive task, and ambiguous 判定へ wording is removed.");
