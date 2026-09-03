const assert=require("assert");
const fs=require("fs");
const vm=require("vm");
const WS=require("../web/storage.js");

const code=fs.readFileSync("web/target_strategy.js","utf8");
const context={window:{}};
vm.createContext(context);
vm.runInContext(code,context);
const T=context.window.ListeningTargetStrategy;
assert.ok(T,"ListeningTargetStrategy must be exposed");

assert.deepStrictEqual(Array.from(T.TARGETS),[60,70,75]);
assert.strictEqual(T.normalizeTarget(999),70);
assert.strictEqual(T.goalLabel(60),"A 60点");
assert.strictEqual(T.goalLabel(70),"B 70点");
assert.strictEqual(T.goalLabel(75),"C 75点");

for(const grade of ["A","B","C"]){
  assert.strictEqual(T.gradeInTarget(60,grade),grade==="A",`60 target ${grade}`);
  assert.strictEqual(T.gradeInTarget(70,grade),grade!=="C",`70 target ${grade}`);
  assert.strictEqual(T.gradeInTarget(75,grade),true,`75 target ${grade}`);
}
assert.ok(T.summary(60).includes("A問題"));
assert.ok(T.summary(70).includes("A・B問題"));
assert.ok(T.summary(75).includes("C問題"));


// Bundled 2019–2026 pack must contain explicit A/B/C classifications for this strategy.
const path=require("path");
const contentFile=fs.readdirSync("web").find(x=>/^content-[0-9a-f]+\.js$/.test(x));
assert.ok(contentFile,"bundled content asset missing");
const content=fs.readFileSync(path.join("web",contentFile),"utf8");
const b64=(content.match(/LISTENING_BUNDLED_PACK_B64="([^"]+)"/)||[])[1];
assert.ok(b64,"bundled pack base64 missing");
const pack=JSON.parse(Buffer.from(b64,"base64").toString("utf8"));
const grades=[];
for(const year of pack.years||[])for(const stimulus of year.stimuli||[])for(const q of stimulus.questions||[])grades.push(q.difficulty);
assert.ok(grades.includes("A")&&grades.includes("B")&&grades.includes("C"),"bundled pack must include A/B/C questions");
const included60=grades.filter(g=>T.gradeInTarget(60,g)).length;
const included70=grades.filter(g=>T.gradeInTarget(70,g)).length;
const included75=grades.filter(g=>T.gradeInTarget(75,g)).length;
assert.ok(included60<included70 && included70<included75,"target expansion must add B then C questions");

// Storage target preference is backward compatible and defaults to B=70.
const def=WS.defaultProgress();
assert.strictEqual(def.targetScore,70);
assert.ok(WS.CURRENT_SCHEMA>=5);
assert.strictEqual(WS.normalizeProgress({schemaVersion:4,attempts:{},history:[],mastery:{}}).targetScore,70);
assert.strictEqual(WS.normalizeProgress({...def,targetScore:60}).targetScore,60);
assert.strictEqual(WS.normalizeProgress({...def,targetScore:75}).targetScore,75);
assert.strictEqual(WS.normalizeProgress({...def,targetScore:999}).targetScore,70);

// Target preference merges by explicit update time; fresh devices accept imported preference.
const fresh={...WS.defaultProgress()};
const imported={...WS.defaultProgress(),targetScore:75,targetUpdatedAt:"2026-08-30T00:00:00Z"};
assert.strictEqual(WS.mergeProgress(fresh,imported).targetScore,75);
const current={...WS.defaultProgress(),targetScore:60,targetUpdatedAt:"2026-08-31T00:00:00Z"};
assert.strictEqual(WS.mergeProgress(current,imported).targetScore,60);

// App must apply the target to required remediation, not to the stored initial score.
const app=fs.readFileSync("web/app.js","utf8");
for(const marker of [
  "function targetWrongQids(year)",
  "function remainingTargetWrongQids(year)",
  "function buildTargetWrongGroups(year",
  "gradeInTarget(qGrade(q))",
  "completedRemediationQids",
  "targetedWrong=wrong.filter",
  "renderTargetStrategy()",
  "targetGoalButtons.addEventListener",
  "pendingAllowedForTarget",
  "targetUpdatedAt",
]){
  assert.ok(app.includes(marker),`missing target-flow marker: ${marker}`);
}
const finish=app.match(/function finishExam\(\)\{[\s\S]*?\n\}/);
assert.ok(finish,"finishExam missing");
assert.ok(finish[0].includes("wrong.push(qid)"),"all initial wrong answers must still be stored");
assert.ok(finish[0].includes("targetedWrong=wrong.filter"),"target subset must be calculated separately");
assert.ok(!finish[0].includes("wrong=wrong.filter"),"target must not rewrite initial wrong-answer history");

// Partial A-only remediation in an A+B stimulus must not mark the whole legacy group done.
const complete=app.match(/function completeCurrentRemediationGroup\(\)\{[\s\S]*?\n\}/);
assert.ok(complete,"completeCurrentRemediationGroup missing");
assert.ok(complete[0].includes("originalGroup.qids.every"),"legacy group completion must require every qid");
assert.ok(complete[0].includes("completedRemediationQids"),"qid-level completion tracking missing");
const pending=app.match(/function pendingAllowedForTarget\(p\)\{[\s\S]*?\n\}/);
assert.ok(pending && pending[0].includes("grades.every"),"lowering target must not continue excluded B/C pending work");

// Weakness and repeated-cause logic must respect the current target.
const weakness=app.match(/function computeWeakness\(\)\{[\s\S]*?\n\}/);
assert.ok(weakness && weakness[0].includes("!gradeInTarget(qGrade(item.q))"),"weakness must filter by target");
const repeated=app.match(/function repeatedCauseInsights\(\)\{[\s\S]*?\n\}/);
assert.ok(repeated && repeated[0].includes("!gradeInTarget(qGrade(q))"),"cause insights must filter by target");

// Target selector wording must make clear that this is not an official school cutoff.
const html=fs.readFileSync("web/index.html","utf8");
assert.ok(html.includes("学校公式の最低点ではなく、受験戦略上の目安です。"));
assert.ok(html.includes('data-target="60"'));
assert.ok(html.includes('data-target="70"'));
assert.ok(html.includes('data-target="75"'));
assert.ok(html.includes("リスニング20点を60/70/75点へ単純換算する設定ではありません"));

console.log("PASS: A60/B70/C75 target strategy, dynamic grade inclusion, qid-level remediation, storage preference, and non-official wording.");
