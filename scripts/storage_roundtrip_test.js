const assert = require("assert");
const WS = require("../web/storage.js");
const legacyNs = String.fromCharCode(119,97,115,101,115,104,105,98,117);

class MemoryStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k,String(v)); }
  removeItem(k){ this.m.delete(k); }
}

function initial(date, score, extra={}){
  return {
    date, score, aMisses: score >= 16 ? 0 : 2,
    answers: {"2023-1-1-q1":0},
    wrongQids: score === 20 ? [] : ["2023-1-1-q1"],
    remediationComplete:false,
    causes:{}, rediagnosis:{},
    ...extra
  };
}

// 1) Legacy v1 -> stable unversioned primary migration.
{
  const s = new MemoryStorage();
  const legacy = {version:1, attempts:{"2023":{initial:initial("2026-01-01T00:00:00Z",12)}}, mastery:{}, history:[]};
  s.setItem(legacyNs + "-step-progress-v1", JSON.stringify(legacy));
  const loaded = WS.load(s);
  assert.strictEqual(loaded.source, "legacy:" + legacyNs + "-step-progress-v1");
  assert.strictEqual(loaded.migrated, true);
  assert.strictEqual(loaded.progress.attempts["2023"].initial.score, 12);
  assert.ok(s.getItem(WS.PRIMARY_KEY), "stable primary must be written");
}

// 2) Same stable key survives future schema/version changes and unknown fields are preserved.
{
  const s = new MemoryStorage();
  const future = WS.defaultProgress();
  future.schemaVersion = 99; future.version = 99;
  future.futureField = {keepMe:true};
  s.setItem(WS.PRIMARY_KEY, JSON.stringify(future));
  const loaded = WS.load(s);
  assert.strictEqual(loaded.progress.schemaVersion, 99);
  assert.deepStrictEqual(loaded.progress.futureField, {keepMe:true});
}

// 3) Automatic backup is created and corrupted primary recovers from backup.
{
  const s = new MemoryStorage();
  const p1 = WS.defaultProgress();
  p1.history=[{year:2023,date:"2026-01-01T00:00:00Z",score:12,aMisses:2,type:"initial"}];
  WS.save(p1,s);
  const p2 = WS.defaultProgress();
  p2.history=[{year:2023,date:"2026-01-02T00:00:00Z",score:14,aMisses:1,type:"initial"}];
  WS.save(p2,s);
  assert.ok(s.getItem(WS.BACKUP_KEY));
  s.setItem(WS.PRIMARY_KEY, "{broken");
  const loaded = WS.load(s);
  assert.strictEqual(loaded.source, "stable-backup");
  assert.strictEqual(loaded.recovered, true);
  assert.strictEqual(loaded.progress.history[0].score,12);
}

// 4) Export/import round trip keeps history and explicitly excludes private pack.
{
  const p = WS.defaultProgress();
  p.attempts["2023"]={initial:initial("2026-02-01T00:00:00Z",14)};
  p.history=[{year:2023,date:"2026-02-01T00:00:00Z",score:14,aMisses:2,type:"initial"}];
  p.mastery.TIME={status:"provisional",due:"2026-02-04",updated:"2026-02-01T01:00:00Z"};
  const text=WS.exportText(p,"2026-02-01T02:00:00Z");
  const envelope=JSON.parse(text);
  assert.strictEqual(envelope.includesPrivatePack,false);
  assert.ok(!("pack" in envelope));
  const parsed=WS.parseImport(text);
  assert.strictEqual(parsed.progress.attempts["2023"].initial.score,14);
  assert.strictEqual(parsed.progress.history.length,1);
  assert.strictEqual(parsed.progress.mastery.TIME.status,"provisional");
}

// 5) Tampered export must fail checksum validation.
{
  const p=WS.defaultProgress();
  p.history=[{year:2023,date:"2026-03-01T00:00:00Z",score:12,aMisses:2,type:"initial"}];
  const obj=JSON.parse(WS.exportText(p,"2026-03-01T01:00:00Z"));
  obj.progress.history[0].score=20;
  assert.throws(()=>WS.parseImport(JSON.stringify(obj)),/チェックサム/);
}

// 6) Merge import never overwrites the earliest initial score.
{
  const current=WS.defaultProgress();
  current.attempts["2023"]={initial:initial("2026-04-01T00:00:00Z",12,{causes:{"q1":["HEAR"]}})};
  current.history=[{year:2023,date:"2026-04-01T00:00:00Z",score:12,aMisses:2,type:"initial"}];

  const imported=WS.defaultProgress();
  imported.attempts["2023"]={
    initial:initial("2026-04-02T00:00:00Z",18,{completedGroups:[0],remediationComplete:true}),
    retakes:[initial("2026-04-03T00:00:00Z",20)]
  };
  imported.history=[{year:2023,date:"2026-04-02T00:00:00Z",score:18,aMisses:0,type:"initial"}];

  const merged=WS.mergeProgress(current,imported);
  assert.strictEqual(merged.attempts["2023"].initial.score,12,"earliest initial score must remain");
  assert.strictEqual(merged.attempts["2023"].initial.remediationComplete,true);
  assert.deepStrictEqual(merged.attempts["2023"].initial.causes.q1,["HEAR"]);
  assert.strictEqual(merged.attempts["2023"].retakes.length,1);
  assert.strictEqual(merged.history.length,2);
}

// 7) Existing local progress and imported progress from different years are safely unioned.
{
  const current=WS.defaultProgress();
  current.attempts["2023"]={initial:initial("2026-05-01T00:00:00Z",16)};
  const imported=WS.defaultProgress();
  imported.attempts["2024"]={initial:initial("2026-05-10T00:00:00Z",14)};
  const merged=WS.mergeProgress(current,imported);
  assert.strictEqual(merged.attempts["2023"].initial.score,16);
  assert.strictEqual(merged.attempts["2024"].initial.score,14);
}

// 8) Legacy raw progress can still be imported.
{
  const legacyRaw=JSON.stringify({version:1,attempts:{"2022":{initial:initial("2025-12-01T00:00:00Z",10)}},history:[],mastery:{}});
  const parsed=WS.parseImport(legacyRaw);
  assert.strictEqual(parsed.format,"legacy-raw-progress");
  assert.strictEqual(parsed.progress.attempts["2022"].initial.score,10);
}

console.log("PASS: storage migration, automatic persistence, backup recovery, export/import round trip, checksum, and merge semantics.");
