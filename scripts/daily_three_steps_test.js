const assert=require("assert");
const fs=require("fs");
const WS=require("../web/storage.js");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

// Old schema-v6 records gain an empty optional daily ledger without changing keys/schema.
const old=WS.normalizeProgress({version:6,schemaVersion:6,attempts:{},history:[]});
assert.strictEqual(old.schemaVersion,6,"daily steps must not force a schema/key break");
assert.deepStrictEqual(old.dailyActivity,{},"old progress must start daily counting at zero without inference");

// Import/merge unions completion IDs, so neither device loses work and duplicates do not double-count.
const current=WS.defaultProgress();
current.dailyActivity={"2026-09-04":{completedBlockIds:["a","b"]}};
const imported=WS.defaultProgress();
imported.dailyActivity={"2026-09-04":{completedBlockIds:["b","c"]},"2026-09-03":{completedBlockIds:["old"]}};
const merged=WS.mergeProgress(current,imported);
assert.deepStrictEqual(new Set(merged.dailyActivity["2026-09-04"].completedBlockIds),new Set(["a","b","c"]));
assert.deepStrictEqual(merged.dailyActivity["2026-09-03"].completedBlockIds,["old"]);

// Invalid rows are ignored, valid IDs are de-duplicated.
const normalized=WS.normalizeProgress({...WS.defaultProgress(),dailyActivity:{
  bad:{completedBlockIds:["x"]},
  "2026-09-04":{completedBlockIds:["a","a",null,""]}
}});
assert.ok(!normalized.dailyActivity.bad,"invalid date rows must not survive normalization");
assert.deepStrictEqual(normalized.dailyActivity["2026-09-04"].completedBlockIds,["a"]);

// UI and completion boundaries.
for(const marker of [
  "const DAILY_STEP_GOAL = 3",
  "function localStudyDate",
  "function markDailyStep",
  "今日の目標を達成しました",
  "さらに1ステップ進める",
  "毎日3ステップ進めた場合",
  "exam-initial:",
  "remediation:",
  "retention-mini:",
  "retention-transfer:",
  "recovery-mini:",
  "recovery-transfer:"
]) assert.ok(app.includes(marker),`daily-three marker missing: ${marker}`);

assert.ok(html.includes('id="dailyProgress"'),"daily progress UI missing");
assert.ok(html.includes('src="storage.js?v=22-daily3"'),"daily storage cache bust missing");
assert.ok(html.includes('src="app.js?v=22-daily3"'),"daily app cache bust missing");
assert.ok(!app.includes("毎日1つ進めた場合"),"old one-step estimate wording remains");

// Completing one remediation group must return to Today before another group starts.
const complete=app.match(/function completeCurrentRemediationGroup\(\)\{[\s\S]*?\n\}/);
assert.ok(complete,"remediation completion function missing");
assert.ok(complete[0].includes("markDailyStep"),"remediation group completion must count once");
assert.ok(!complete[0].includes("r.idx++"),"next remediation group must not auto-start past the daily boundary");

const finishExam=app.match(/function finishExam\(\)\{[\s\S]*?\n\}/);
assert.ok(finishExam&&finishExam[0].includes("const isFirstAttempt="),
  "only a genuinely new initial attempt may count as the daily exam step");
assert.ok(finishExam[0].includes("if(isFirstAttempt) markDailyStep"),
  "a stale non-retake flag must not count an existing initial attempt again");

const retention=app.match(/function submitRetention\(\)\{[\s\S]*?\n\}/);
assert.ok(retention&&retention[0].includes("ダッシュボードへ"),
  "failed retention must return to Today before starting the next recovery step");
const transferFailed=app.match(/function transferFailed\(\)\{[\s\S]*?\n\}/);
assert.ok(transferFailed&&transferFailed[0].includes('showView("dashboardView");renderDashboard()'),
  "failed retention transfer must expose the daily boundary before recovery");

console.log("PASS: daily goal is three resumable learning steps, completion IDs merge safely, and learning can continue after the goal.");
