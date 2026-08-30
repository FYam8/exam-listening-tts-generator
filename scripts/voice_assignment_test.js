"use strict";
const assert = require("node:assert");
const profiles = require("../web/voice_profiles.js");

const voices = [
  {name:"Microsoft Guy Online (Natural)",lang:"en-US"},
  {name:"Microsoft Jenny Online (Natural)",lang:"en-US"},
  {name:"Google UK English Male",lang:"en-GB"},
  {name:"Google UK English Female",lang:"en-GB"},
  {name:"Unlabelled English Voice",lang:"en-US"}
];

assert.equal(profiles.genderOf(voices[0]), "man");
assert.equal(profiles.genderOf(voices[1]), "woman");
assert.equal(profiles.genderOf(voices[2]), "man");
assert.equal(profiles.genderOf(voices[3]), "woman");
assert.equal(profiles.genderOf(voices[4]), "unknown");

const men = profiles.rowsFor(voices, "man");
const women = profiles.rowsFor(voices, "woman");
assert.deepEqual(men.map(row=>row.index), [0,2]);
assert.deepEqual(women.map(row=>row.index), [1,3]);
assert.ok(men.every(row=>row.gender === "man"));
assert.ok(women.every(row=>row.gender === "woman"));
assert.notEqual(profiles.preferredIndex(men,"man"), profiles.preferredIndex(women,"woman"));

console.log("PASS: Man and Woman selectors receive separate gender-matched voice candidates.");
