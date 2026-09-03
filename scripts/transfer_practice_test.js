const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function loadGlobal(file, prop){
  const sandbox={window:{}};
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file,"utf8"),sandbox);
  return sandbox.window[prop];
}

const bank=loadGlobal("web/transfer_bank.js","LISTENING_TRANSFER_BANK");
assert.ok(Array.isArray(bank) && bank.length>=20,"transfer bank missing");

const short=bank.filter(x=>x.kind==="short");
const long=bank.filter(x=>x.kind==="long");
assert.ok(short.length>=12,"need short transfer coverage");
assert.ok(long.length>=12,"need long transfer coverage");

for(const x of short){
  assert.ok(x.wordCount>=60 && x.wordCount<=150,`${x.id}: short word count out of range`);
  assert.ok(x.turnCount>=5 && x.turnCount<=10,`${x.id}: turn count out of range`);
  assert.strictEqual(x.questions.length,1,`${x.id}: short transfer must have one question`);
}
for(const x of long){
  assert.ok(x.wordCount>=160 && x.wordCount<=260,`${x.id}: long word count out of range`);
  assert.strictEqual(x.questions.length,2,`${x.id}: long transfer must have two questions`);
}

for(const tag of ["CHANGE","TIME","MONEY"]){
  assert.ok(short.some(x=>!x.retentionOnly && x.tags.includes(tag)),`missing immediate short ${tag}`);
  assert.ok(short.some(x=>x.retentionOnly && x.tags.includes(tag)),`missing retention short ${tag}`);
}

for(const tag of ["PURPOSE","PLACE","MAIN","TRUEFALSE","DETAIL","TIME","NOT","REASON"]){
  assert.ok(long.some(x=>!x.retentionOnly && x.tags.includes(tag)),`missing immediate long ${tag}`);
  assert.ok(long.some(x=>x.retentionOnly && x.tags.includes(tag)),`missing retention long ${tag}`);
}

const app=fs.readFileSync("web/app.js","utf8");
for(const marker of [
  "transferModeForPending",
  "startTransfer(",
  "renderTransfer",
  "playTransfer",
  "submitTransfer",
  "transferPassed",
  "transferFailed",
  "retention-transfer",
  "sourceProfileForPending"
]){
  assert.ok(app.includes(marker),`app missing ${marker}`);
}
assert.ok(app.includes('profile.section===2) return "long"'),"section2 must use long transfer");
assert.ok(app.includes('["CHANGE","TIME","MONEY"]'),"B short transfer skills missing");
assert.ok(app.includes('retentionMode:"mini"'),"mini retention mode missing");
for(const marker of ["updateCount","decoyCount","calculation","trapTypes","lexicalIndex","questionTypes"]){
  assert.ok(app.includes(marker),`source-pattern matching missing ${marker}`);
}




// Every two-skill pattern that can emerge from an actual long-passage missed group
// must be covered by one immediate and one retention Level-3 set.
const fs2 = require("fs");
const vm2 = require("vm");
const sandbox={window:{}};
sandbox.globalThis=sandbox;
vm2.createContext(sandbox);
const contentFile=fs2.readdirSync("web").find(x=>/^content-[0-9a-f]{12}\.js$/.test(x));
vm2.runInContext(fs2.readFileSync(`web/${contentFile}`,"utf8"),sandbox);
const packed=JSON.parse(Buffer.from(sandbox.window.LISTENING_BUNDLED_PACK_B64,"base64").toString("utf8"));
const requiredPairs=[];
for(const y of packed.years){
  for(const s of y.stimuli){
    if(Number(s.section)!==2) continue;
    const tags=[];
    for(const q of s.questions){
      for(const tag of (q.tags||[])) if(!tags.includes(tag)) tags.push(tag);
    }
    const pair=tags.slice(0,2);
    const key=pair.join("|");
    if(pair.length && !requiredPairs.some(x=>x.join("|")===key)) requiredPairs.push(pair);
  }
}
for(const pair of requiredPairs){
  for(const retentionOnly of [false,true]){
    const ok=long.some(x=>!!x.retentionOnly===retentionOnly && pair.every(t=>(x.tags||[]).includes(t)));
    assert.ok(ok,`missing ${retentionOnly?"retention":"immediate"} Level-3 coverage for ${pair.join("+")}`);
  }
}

console.log("PASS: Level 1→Level 2/3 ranges, actual long-question pair coverage, retention pools, and app flow markers.");
