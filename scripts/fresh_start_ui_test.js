const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");
const WS=require("../web/storage.js");

// No-learning-data state must default cleanly and select the 2023 first exam route.
const def=WS.defaultProgress();
assert.deepStrictEqual(def.attempts,{});
assert.deepStrictEqual(def.history,[]);
assert.strictEqual(def.activeSession,null);

// Fresh start must open exam and immediately render/verify choices.
const start=app.match(/function startExam\([^)]*\)\{[\s\S]*?\n\}/);
const render=app.match(/function renderExam\(\)\{[\s\S]*?\n\}/);
const ensure=app.match(/function ensureExamAnswerUi\(\)\{[\s\S]*?\n\}/);
const nextTask=app.match(/function computeNextTask\(\)\{[\s\S]*?\n\}/);
assert.ok(start&&render&&ensure&&nextTask,"fresh-start exam functions missing");
assert.ok(nextTask[0].includes('if(!getInitial(2023)) return {type:"exam",year:2023'),
  "empty progress must start with 2023 exam");
assert.ok(start[0].includes("renderExam();"),"startExam must render the first screen immediately");
assert.ok(start[0].includes("if(!ensureExamAnswerUi())"),
  "startExam must verify choices immediately after rendering");
assert.ok(start[0].includes("examPlayBtn.disabled=true"),
  "audio must be blocked if initial choices are missing");
assert.ok(start[0].includes("examNextBtn.disabled=true"),
  "Next must be blocked if initial choices are missing");

// The essential answer UI must be rendered before decorative header fields.
assert.ok(render[0].indexOf("renderExamQuestions()") < render[0].indexOf("examTitle"),
  "choices must render before decorative exam title/progress");
for(const marker of [
  "if(els.examTitle)","if(els.examProgressText)","if(els.examProgressBar)",
  "if(els.examSectionLabel)","if(els.examStimulusLabel)"
]){
  assert.ok(render[0].includes(marker),`optional header guard missing: ${marker}`);
}

// Visible build ID lets a tester verify that the intended deployment actually loaded.
assert.ok(html.includes('id="buildBadge"'),"build badge missing");
assert.ok(html.includes("Build v22"),"v22 build label missing");
assert.ok(html.includes('src="app.js?v=22-daily3"'),"daily-three app cache bust missing");
assert.ok(html.includes('href="styles.css?v=22"'),"styles.css v21 cache bust missing");
assert.ok(html.includes('id="examUiError"'),"exam UI error surface missing");

// Playback itself must still refuse to run without answer UI.
const play=app.match(/async function playExam\(\)\{[\s\S]*?\n\}/);
assert.ok(play&&play[0].includes("ensureExamAnswerUi()"),"playback answer preflight missing");
assert.ok(play[0].indexOf("ensureExamAnswerUi()") < play[0].indexOf("playStimulusQueued"),
  "audio can start before answer UI validation");

console.log("PASS: zero-history first start routes to 2023, renders choices immediately, blocks audio/next on failure, and exposes Build v22 for deployment verification.");
