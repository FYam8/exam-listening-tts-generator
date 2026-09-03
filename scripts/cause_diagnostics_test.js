const assert=require("assert");
const fs=require("fs");
const WS=require("../web/storage.js");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

// Taxonomy and UX.
for(const marker of ["HEAR","VOCAB","MEANING","UPDATE","CALC","QUESTION","MEMO","CARELESS","UNKNOWN"]){
  assert.ok(app.includes(marker),`missing cause ${marker}`);
}
assert.ok(html.includes("スクリプトを確認した後で選びます"),"cause must be selected after script review");
assert.ok(app.includes("current===c?[]:[c]"),"cause must be single-select/editable");
assert.ok(app.includes("persistentMiss && !r.cause"),"persistent miss must require a cause or UNKNOWN");
assert.ok(app.includes("原因入力は任意です"),"one-pass cause input must be optional");

// Automatic one-pass diagnostic.
assert.ok(app.includes("onePass:correct"),"initial wrong -> rediagnosis correct one-pass flag missing");
assert.ok(app.includes("persistentMiss:!correct"),"persistent miss flag missing");

// Cause changes remediation, not Level-2/3 routing.
const modeMatch=app.match(/function transferModeForPending\(p\)\{[\s\S]*?\n\}/);
assert.ok(modeMatch,"transferModeForPending missing");
const mode=modeMatch[0];
assert.ok(mode.includes('profile.section===2) return "long"'),"section2 routing changed");
assert.ok(mode.includes('profile.hasB && profile.tags.some(t=>["CHANGE","TIME","MONEY"].includes(t))'),"B short routing changed");
assert.ok(!mode.includes("cause"),"cause must not directly decide Level 2/3 routing");
assert.ok(app.includes('causes.has("UPDATE")'),"UPDATE should refine Level 1 content");
assert.ok(app.includes('causes.has("CALC")'),"CALC should refine Level 1 content");
assert.ok(app.includes('c==="UPDATE") state.script.highlight=true'),"UPDATE should trigger update-word support");
assert.ok(app.includes('c==="HEAR") els.practiceSpeed.value="0.85"'),"HEAR should trigger slower replay support");

// Repeated-cause analysis: different stimuli only and current target range only.
assert.ok(app.includes("seenStimulus"),"repeated cause should dedupe same stimulus");
assert.ok(app.includes("!gradeInTarget(qGrade(q))"),"repeated cause must ignore grades outside current target");
assert.ok(app.includes("r.total>=2"),"repeated cause threshold missing");
assert.ok(app.includes("r.weighted+=3"),"A cause weighting missing");
assert.ok(app.includes("r.weighted+=2"),"B cause weighting missing");
assert.ok(app.includes("r.c++;r.weighted+=1"),"C cause weighting for 75-point target missing");

// Diagnostics must survive safe import merge.
function makeInitial(date,cause,diag){
  return {
    date,score:12,aMisses:2,answers:{"q":0},wrongQids:["q"],
    causes:{"q":[cause]},rediagnosis:{"q":{answer:1,correct:false,date}},
    diagnostics:{"q":diag},completedGroups:[],remediationComplete:false
  };
}
const current=WS.defaultProgress();
current.attempts["2023"]={initial:makeInitial("2026-01-01T00:00:00Z","UPDATE",{onePass:false,persistentMiss:true,causeUpdatedAt:"2026-01-02T00:00:00Z"})};
const imported=WS.defaultProgress();
imported.attempts["2023"]={initial:makeInitial("2026-01-01T00:00:00Z","HEAR",{onePass:true,persistentMiss:false,rediagnosedAt:"2026-01-01T01:00:00Z"})};
const merged=WS.mergeProgress(current,imported);
assert.strictEqual(merged.attempts["2023"].initial.causes.q[0],"UPDATE","current edited cause should win merge");
assert.strictEqual(merged.attempts["2023"].initial.diagnostics.q.persistentMiss,true,"current diagnostic should survive merge");

// Existing storage key must remain backward compatible.
const legacyNs=String.fromCharCode(119,97,115,101,115,104,105,98,117);
assert.strictEqual(WS.PRIMARY_KEY,legacyNs+"-listening-progress");
assert.ok(WS.CURRENT_SCHEMA>=4,"schema must include cause diagnostics merge support");

console.log("PASS: cause diagnosis taxonomy, ONE_PASS logic, cause-remediation separation, repeated-cause priority, and persistence.");
