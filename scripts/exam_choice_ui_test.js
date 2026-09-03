const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

const renderQ=app.match(/function renderExamQuestions\(\)\{[\s\S]*?\n\}/);
const ensure=app.match(/function ensureExamAnswerUi\(\)\{[\s\S]*?\n\}/);
const render=app.match(/function renderExam\(\)\{[\s\S]*?\n\}/);
const play=app.match(/async function playExam\(\)\{[\s\S]*?\n\}/);

assert.ok(renderQ&&ensure&&render&&play,"exam UI functions missing");
assert.ok(renderQ[0].includes("renderChoiceGroup"),"exam choices must be rendered");
assert.ok(renderQ[0].includes("setActiveSession(examSessionSnapshot()"),"exam answer checkpoint missing");
assert.ok(render[0].indexOf("renderExamQuestions()") < render[0].indexOf("examTitle"),
  "questions must render before optional title/progress nodes");
for(const marker of [
  "if(els.examTitle)",
  "if(els.examProgressText)",
  "if(els.examProgressBar)",
  "if(els.examSectionLabel)",
  "if(els.examStimulusLabel)"
]){
  assert.ok(render[0].includes(marker),`optional DOM guard missing: ${marker}`);
}
assert.ok(play[0].includes("ensureExamAnswerUi()"),"audio must verify choices before starting");
assert.ok(play[0].indexOf("ensureExamAnswerUi()") < play[0].indexOf("playStimulusQueued"),
  "choice integrity check must happen before audio");
assert.ok(play[0].includes("回答選択肢を表示できないため、音声再生を開始しませんでした"),
  "audio failure guidance missing");

// Public asset URLs must be cache-busted so an old app.js cannot be mixed with a new index.html.
assert.ok(/src="app\.js\?v=22-daily3"/.test(html),"daily-three app.js cache-busting version missing");
assert.ok(/href="styles\.css\?v=22"/.test(html),"styles.css cache-busting version missing");
assert.ok(html.includes('src="storage.js?v=22-daily3"'),"daily storage cache-busting missing");
for(const dep of ["study_plan.js","target_strategy.js","transfer_bank.js"]){
  assert.ok(html.includes(`src="${dep}?v=22"`),`cache-busting missing for ${dep}`);
}
assert.ok(html.includes('src="original_bank.js?v=22-reason1"'),"updated original bank cache-busting version missing");

// Essential exam container must still exist.
for(const id of ["examView","examQuestions","examPlayBtn","examNextBtn"]){
  assert.ok(html.includes(`id="${id}"`),`missing essential exam DOM id: ${id}`);
}

console.log("PASS: exam choices render first, optional header nodes cannot abort answers, audio cannot start without choices, and public assets are cache-busted.");
