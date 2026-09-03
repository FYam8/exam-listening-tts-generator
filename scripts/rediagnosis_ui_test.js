const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

for(const id of [
  "rediagnosisView","rediagnosisTitle","rediagnosisAudioStatus","rediagnosisPlayBtn",
  "rediagnosisQuestions","rediagnosisSubmitBtn","rediagnosisResult"
]){
  assert.ok(html.includes(`id="${id}"`),`missing rediagnosis DOM id: ${id}`);
}

const renderQ=app.match(/function renderRediagnosisQuestions\(\)\{[\s\S]*?\n\}/);
assert.ok(renderQ,"renderRediagnosisQuestions missing");
assert.ok(renderQ[0].includes("q.choices.length!==4"),"rediagnosis must validate four answer choices");
assert.ok(renderQ[0].includes("renderChoiceGroup"),"rediagnosis must render answer choices");
assert.ok(renderQ[0].includes("r.answers[qid]=i"),"choices must remain selectable");

const ensure=app.match(/function ensureRediagnosisAnswerUi\(\)\{[\s\S]*?\n\}/);
assert.ok(ensure,"ensureRediagnosisAnswerUi missing");
assert.ok(ensure[0].includes('querySelectorAll(".choice").length'),"pre-play UI must verify choices exist");
assert.ok(ensure[0].includes("expectedChoices=g.qids.length*4"),"pre-play UI must require four choices per question");

const play=app.match(/async function playRediagnosis\(\)\{[\s\S]*?\n\}/);
assert.ok(play,"playRediagnosis missing");
assert.ok(play[0].includes("ensureRediagnosisAnswerUi()"),"audio must not start with missing answer UI");
assert.ok(play[0].indexOf("ensureRediagnosisAnswerUi()") < play[0].indexOf("playStimulusQueued"),
  "answer UI must be verified before audio starts");
assert.ok(play[0].includes("rediagnosisSubmitBtn.disabled=true"),
  "submit must be disabled while playback begins");

const render=app.match(/function renderRediagnosis\(\)\{[\s\S]*?\n\}/);
assert.ok(render,"renderRediagnosis missing");
assert.ok(render[0].includes('state.speaking?"再生中…"'),"playback status must survive choice clicks");
assert.ok(render[0].includes("rediagnosisSubmitBtn.disabled=!listeningReady"),
  "submit must require visible choices, completed replay, answers, and no active speech");

// Correct answer must remain hidden until submitRediagnosis.
const beforeSubmit=app.slice(0,app.indexOf("function submitRediagnosis"));
assert.ok(!/renderChoiceGroup\([^)]*,\s*true\s*\)/.test(beforeSubmit),
  "rediagnosis must not reveal correct choices before submission");
assert.ok(html.includes("正解は「再回答を確定」するまで表示しません"),
  "UI must explain that choices are visible but correct answer remains hidden");

console.log("PASS: rediagnosis choices are rendered before/during audio, stay selectable, submit waits for playback, and correct answer remains hidden.");
