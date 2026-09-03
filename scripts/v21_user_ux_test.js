const fs=require("fs");
const assert=require("assert");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

assert.ok(app.includes("voiceLoadAttempts:0"),"voice load retry state missing");
assert.ok(app.includes("state.voiceLoadAttempts>=3"),"no-voice terminal guidance missing");
assert.ok(app.includes("英語音声を利用できません"),"no-voice visible message missing");

const voiceTest=app.match(/els\.voiceTestBtn\.addEventListener\("click",async\(\)=>\{[\s\S]*?\n  \}\);/);
assert.ok(voiceTest,"voice test handler missing");
assert.ok(voiceTest[0].includes("try{"),"voice test success handling missing");
assert.ok(voiceTest[0].includes("catch(err)"),"voice test failure handling missing");
assert.ok(voiceTest[0].includes("els.voiceStatus.textContent=speechFailureMessage()"),"voice test failure is not visible");

assert.ok(app.includes("音声 ${e.idx+1}/${e.stimuli.length}・問題 ${questionRange}/${totalQuestions}"),"10-question progress label missing");
assert.ok(app.includes("「続きから次へ進む」で同じ続きから再開できます"),"resume message does not match the visible button");
assert.ok(!app.includes("「今日の学習を始める」で同じ続きから再開できます"),"stale resume button wording remains");

assert.ok(html.includes("Build v22 · loading"),"v22 loading marker missing");
assert.ok(html.includes('src="app.js?v=22-daily3"'),"daily-three app cache bust missing");
assert.ok(app.includes('els.buildBadge.textContent="Build v22 ✓"'),"v22 runtime marker missing");
assert.ok(app.includes("Build v22を確認して再読み込みしてください"),"rediagnosis recovery message is not Build v22");
assert.ok(!app.includes("Build v19を確認して再読み込みしてください"),"stale Build v19 rediagnosis guidance remains");
assert.ok(!app.includes("Build v21"),"stale Build v21 user-facing guidance remains");

console.log("PASS: v22 user-facing audio errors, no-voice guidance, 10-question progress, resume wording, and recovery/build markers.");
