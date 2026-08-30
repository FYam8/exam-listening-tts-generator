"use strict";
const assert = require("node:assert");
const plan = require("../web/study_plan.js");

const YEARS = [2019,2020,2021,2022,2023,2024,2025,2026];

assert.equal(plan.PASS_SCORE, 12);
assert.equal(plan.STABLE_SCORE, 14);
assert.equal(plan.strategicLabel(11), "要補強");
assert.equal(plan.strategicLabel(12), "6割ライン到達");
assert.equal(plan.strategicLabel(14), "安定目標達成");
assert.equal(plan.isStableAttempt({score:14,aMisses:1},true), true);
assert.equal(plan.isStableAttempt({score:13,aMisses:0},true), false);
assert.equal(plan.isStableAttempt({score:14,aMisses:2},true), false);

const fresh = {attempts:{},mastery:{}};
assert.deepEqual(plan.estimateRemaining(fresh,YEARS,"2026-08-30"), {
  min:19,max:23,remainingYears:8,activeRemediation:0
});

const complete = {attempts:{},mastery:{}};
for(const year of YEARS){
  complete.attempts[year]={initial:{score:14,aMisses:1,wrongQids:[],remediationComplete:true}};
}
assert.deepEqual(plan.estimateRemaining(complete,YEARS,"2026-08-30"), {
  min:0,max:0,remainingYears:0,activeRemediation:0
});

complete.mastery.CHANGE={status:"provisional",due:"2026-09-02"};
assert.deepEqual(plan.estimateRemaining(complete,YEARS,"2026-08-30"), {
  min:1,max:5,remainingYears:0,activeRemediation:0
});

console.log("PASS: 12/20 pass line, 14/20 stability goal, and remaining-day estimate.");
