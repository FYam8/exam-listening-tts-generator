const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const html=fs.readFileSync("web/index.html","utf8");

function fn(name){
  const m=app.match(new RegExp(`(?:async\\s+)?function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m,`${name} missing`);
  return m[0];
}

// Every view touched by showView must exist in HTML and be cached.
const show=fn("showView");
const cache=fn("cacheEls");
const listMatch=show.match(/\["dashboardView"[\s\S]*?"historyView"\]/);
assert.ok(listMatch,"showView view list missing");
const views=[...listMatch[0].matchAll(/"([^"]+View)"/g)].map(m=>m[1]);
for(const id of views){
  assert.ok(html.includes(`id="${id}"`),`HTML missing view: ${id}`);
  assert.ok(cache.includes(`"${id}"`),`cacheEls missing view: ${id}`);
}
assert.ok(views.includes("transferView"),"transferView must be part of navigation registry");

// All listening answer surfaces must require audio before scoring/progression.
const specs=[
  ["exam","renderExam","examNext","e.played[s.id]","examNextBtn"],
  ["rediagnosis","renderRediagnosis","submitRediagnosis","r.played[s.id]","rediagnosisSubmitBtn"],
  ["drill","renderDrill","submitDrill","d.played[it.id]","drillSubmitBtn"],
  ["transfer","renderTransfer","submitTransfer","t.played[it.id]","transferSubmitBtn"],
  ["retention","renderRetention","submitRetention","r.played","retentionSubmitBtn"],
];
for(const [name,renderName,submitName,playedMarker,buttonMarker] of specs){
  const render=fn(renderName);
  const submit=fn(submitName);
  assert.ok(render.includes("listeningReady("),`${name}: render must gate action by listeningReady`);
  assert.ok(render.includes(buttonMarker),`${name}: action button state missing`);
  assert.ok(submit.includes(playedMarker),`${name}: submit/next must check played state`);
  assert.ok(submit.includes("先に音声"),`${name}: user guidance for no-audio state missing`);
}

// Submit buttons should also require actual answers, not merely visible choices.
assert.ok(fn("renderExam").includes("allAnswered("),"exam answer-readiness missing");
assert.ok(fn("renderRediagnosis").includes("allAnswered("),"rediagnosis answer-readiness missing");
assert.ok(fn("renderDrill").includes("d.answers[d.idx]!=null"),"drill answer-readiness missing");
assert.ok(fn("renderTransfer").includes("allAnswered("),"transfer answer-readiness missing");
assert.ok(fn("renderRetention").includes("r.answer!=null"),"retention answer-readiness missing");

// Build marker.
assert.ok(html.includes("Build v22 · loading"),"v21 loading badge missing");
assert.ok(html.includes('src="app.js?v=22-today-p0"'),"P0 Today-flow app cache-bust missing");
assert.ok(app.includes('els.buildBadge.textContent="Build v22 ✓"'),"v21 runtime badge missing");

console.log("PASS: view registry is complete and all five listening answer surfaces require audio + valid answers before scoring/progression.");
