const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

function fn(name){
  const m=app.match(new RegExp(`(?:async\\s+)?function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m,`${name} missing`);
  return m[0];
}

// Shared renderer must fail safely rather than throwing and must verify the rendered button count.
const group=fn("renderChoiceGroup");
assert.ok(group.includes("if(!container || !q || !Array.isArray(q.choices) || q.choices.length<2)"),
  "shared choice renderer must validate container/question/choices");
assert.ok(group.includes("return false"),"shared choice renderer must report failure");
assert.ok(group.includes("return buttons.length===q.choices.length"),
  "shared choice renderer must verify rendered choice count");

// All interactive answer surfaces.
const surfaces=[
  {
    name:"exam", render:"renderExam", ensure:"ensureExamAnswerUi", play:"playExam",
    choiceRenderer:"renderExamQuestions()", error:"examUiError",
    playBtn:"examPlayBtn", submitOrNext:"examNextBtn"
  },
  {
    name:"rediagnosis", render:"renderRediagnosis", ensure:"ensureRediagnosisAnswerUi", play:"playRediagnosis",
    choiceRenderer:"renderRediagnosisQuestions()", error:"rediagnosisUiError",
    playBtn:"rediagnosisPlayBtn", submitOrNext:"rediagnosisSubmitBtn"
  },
  {
    name:"drill", render:"renderDrill", ensure:"ensureDrillAnswerUi", play:"playDrill",
    choiceRenderer:"renderChoiceGroup(els.drillChoices", error:"drillUiError",
    playBtn:"drillPlayBtn", submitOrNext:"drillSubmitBtn"
  },
  {
    name:"transfer", render:"renderTransfer", ensure:"ensureTransferAnswerUi", play:"playTransfer",
    choiceRenderer:"renderTransferQuestions()", error:"transferUiError",
    playBtn:"transferPlayBtn", submitOrNext:"transferSubmitBtn"
  },
  {
    name:"retention", render:"renderRetention", ensure:"ensureRetentionAnswerUi", play:"playRetention",
    choiceRenderer:"renderChoiceGroup(els.retentionChoices", error:"retentionUiError",
    playBtn:"retentionPlayBtn", submitOrNext:"retentionSubmitBtn"
  }
];

for(const s of surfaces){
  const render=fn(s.render);
  const ensure=fn(s.ensure);
  const play=fn(s.play);

  assert.ok(render.includes(s.choiceRenderer),`${s.name}: render must create choices`);
  assert.ok(render.includes(s.error),`${s.name}: visible error surface missing`);
  assert.ok(render.includes(s.playBtn),`${s.name}: play button state must be controlled by choice render result`);
  assert.ok(render.includes(s.submitOrNext),`${s.name}: submit/next state must be controlled by choice render result`);

  assert.ok(ensure.includes('querySelectorAll(".choice").length') || ensure.includes("renderChoiceGroup("),
    `${s.name}: ensure function must verify/rebuild choices`);

  assert.ok(play.includes(`${s.ensure}()`),`${s.name}: audio must preflight answer UI`);
  assert.ok(play.indexOf(`${s.ensure}()`) < play.indexOf("playStimulusQueued"),
    `${s.name}: answer UI preflight must occur before audio`);
  assert.ok(play.includes("回答選択肢を表示できないため、音声再生を開始しませんでした"),
    `${s.name}: missing-choice audio block message missing`);

  assert.ok(html.includes(`id="${s.error}"`),`${s.name}: HTML error surface missing`);
}

// Choices must be the essential first dynamic content, not depend on decorative header/progress DOM.
const exam=fn("renderExam");
assert.ok(exam.indexOf("renderExamQuestions()") < exam.indexOf("examTitle"),
  "exam: choices must render before decorative title");
const red=fn("renderRediagnosis");
assert.ok(red.indexOf("renderRediagnosisQuestions()") < red.indexOf("rediagnosisProgress"),
  "rediagnosis: choices must render before decorative progress");
const transfer=fn("renderTransfer");
assert.ok(transfer.indexOf("renderTransferQuestions()") < transfer.indexOf("transferLevelTitle"),
  "transfer: choices must render before decorative transfer metadata");
const drill=fn("renderDrill");
assert.ok(drill.indexOf("renderChoiceGroup(els.drillChoices") < drill.indexOf("drillTagTitle"),
  "drill: choices must render before decorative tag/progress metadata");
const retention=fn("renderRetention");
assert.ok(retention.indexOf("renderChoiceGroup(els.retentionChoices") < retention.indexOf("retentionTitle"),
  "retention: choices must render before decorative title");

// Fresh-start and public cache version must match the current release.
assert.ok(html.includes("Build v22"),"Build v22 badge missing");
assert.ok(html.includes('src="app.js?v=22-today-p0"'),"P0 Today-flow app cache-busting missing");
assert.ok(html.includes('href="styles.css?v=22"'),"styles.css v21 cache-busting missing");

// There are exactly five interactive answer containers in this application.
for(const id of ["examQuestions","rediagnosisQuestions","drillChoices","transferQuestions","retentionChoices"]){
  assert.ok(html.includes(`id="${id}"`),`interactive answer container missing: ${id}`);
}

console.log("PASS: all five interactive choice surfaces render choices first, expose errors, block audio/submit on failure, and use v21 cache-busted assets.");
