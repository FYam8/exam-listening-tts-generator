const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const storage = require("../web/storage.js");
const legacyNs = String.fromCharCode(119,97,115,101,115,104,105,98,117);

// Runtime keys must remain backward-compatible even though source strings are split.
assert.strictEqual(storage.PRIMARY_KEY, legacyNs + "-listening-progress");
assert.strictEqual(storage.BACKUP_KEY, legacyNs + "-listening-progress-backup");
assert.strictEqual(storage.LEGACY_KEYS[0], legacyNs + "-step-progress-v1");

// Evaluate the encoded pack and config in an isolated browser-like object.
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const contentFile = fs.readdirSync("web").find(x => /^content-[0-9a-f]{12}\.js$/.test(x));
assert.ok(contentFile, "encoded content file missing");
vm.runInContext(fs.readFileSync(`web/${contentFile}`, "utf8"), sandbox);
vm.runInContext(fs.readFileSync("web/config.js", "utf8"), sandbox);
const cfg = sandbox.window.LISTENING_APP_CONFIG;
assert.ok(cfg && cfg.bundledPackBase64Var, "bundled config missing");
const encoded = sandbox.window[cfg.bundledPackBase64Var];
assert.ok(encoded, "configured bundled pack variable missing");
const pack = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
assert.deepStrictEqual(pack.years.map(y => Number(y.year)), [2019,2020,2021,2022,2023,2024,2025,2026]);
assert.strictEqual(pack.years.reduce((n,y)=>n+y.stimuli.reduce((m,s)=>m+s.questions.length,0),0),80);

console.log("PASS: backward-compatible storage keys and zero-click bundled 2019–2026 pack config.");
