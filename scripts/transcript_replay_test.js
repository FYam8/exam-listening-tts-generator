const assert=require("assert");
const fs=require("fs");

const app=fs.readFileSync("web/app.js","utf8");
const css=fs.readFileSync("web/styles.css","utf8");

function fn(name){
  const m=app.match(new RegExp(`(?:async\\s+)?function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m,`${name} missing`);
  return m[0];
}

assert.ok(app.includes("function transcriptHtml("),"transcript renderer missing");
assert.ok(app.includes("function replayOriginalAfterAnswer("),"post-answer replay helper missing");
assert.ok(css.includes(".answer-transcript"),"transcript styling missing");
assert.ok(css.includes(".answer-review-actions"),"review action styling missing");

const drill=fn("submitDrill");
assert.ok(drill.includes("transcriptHtml(it.turns)"),"Level 1 must reveal transcript after answer");
assert.ok(drill.includes("drillReplayAfterAnswer"),"Level 1 replay button missing");
assert.ok(drill.includes("replayOriginalAfterAnswer"),"Level 1 replay handler missing");

const transfer=fn("submitTransfer");
assert.ok(transfer.includes("transcriptHtml(it.turns)"),"Level 2/3 must reveal transcript after answer");
assert.ok(transfer.includes("transferReplayAfterAnswer"),"Level 2/3 replay button missing");
assert.ok(transfer.includes("replayOriginalAfterAnswer"),"Level 2/3 replay handler missing");

const retention=fn("submitRetention");
assert.ok(retention.includes("transcriptHtml(r.item.turns)"),"Retention must reveal transcript after answer");
assert.ok(retention.includes("retentionReplayAfterAnswer"),"Retention replay button missing");
assert.ok(retention.includes("replayOriginalAfterAnswer"),"Retention replay handler missing");

console.log("PASS: transcript appears only in post-answer feedback and replay is available for Level 1, Level 2/3, and retention.");
