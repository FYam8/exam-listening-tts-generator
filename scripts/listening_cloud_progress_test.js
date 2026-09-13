const fs = require('fs');
const assert = require('assert');

const sync = fs.readFileSync('web/progress-sync.js', 'utf8');
const config = fs.readFileSync('web/config.js', 'utf8');
const storage = fs.readFileSync('web/storage.js', 'utf8');

assert.match(sync, /APP_ID='listening'/);
assert.match(sync, /STORAGE_KEY='waseshibu-listening-progress'/);
assert.match(sync, /SYNC_DB='waseshibu-progress-sync'/);
assert.match(sync, /SYNC_DB_VERSION=7/);
assert.match(sync, /v1\/register-anonymous/);
assert.match(sync, /v1\/control/);
assert.match(sync, /progress\/snapshot/);
assert.match(sync, /events\/batch/);
assert.match(sync, /state:summary/);
assert.match(sync, /state:mastery/);
assert.match(sync, /state:retention/);
assert.match(sync, /state:today/);
assert.match(sync, /state:active-session/);
assert.match(sync, /function buildOccurrenceRecords/);
assert.match(sync, /reg\?\.status!=='production'/);
assert.match(sync, /occurrenceSignature:/);
assert.match(sync, /pagehide/);
assert.match(sync, /studying remains local-first/);

// Never upload raw listening answers, scripts, pending payloads or active-session payloads.
assert.doesNotMatch(sync, /payload\s*:\s*[^\n]*(answers|script|transcript)/i);
assert.doesNotMatch(sync, /JSON\.stringify\([^\n]*(activeSession|pending)/);

// The cloud layer must reuse the stable local key without changing schema/storage ownership.
assert.match(storage, /CURRENT_SCHEMA = 6/);
assert.match(storage, /PRIMARY_KEY = KEY_NS \+ "-listening-progress"/);
assert.match(storage, /pending: null/);
assert.match(storage, /activeSession: null/);
assert.doesNotMatch(storage, /progress-sync|CloudSync|events\/batch/);

// Loader is additive and failure-isolated; it must not replace the normal app boot path.
assert.match(config, /progress-sync\.js\?v=22-cloud1/);
assert.match(config, /document\.createElement\("script"\)/);
assert.match(config, /catch \{\}/);

// Current-state rows must ignore occurredAt when deciding whether to create a revision.
assert.match(sync, /canonicalJson\(\{eventType:record\.eventType,payload:record\.payload\}\)/);
assert.doesNotMatch(sync, /canonicalJson\(\{eventType:record\.eventType,occurredAt:record\.occurredAt,payload:record\.payload\}\)/);

console.log('Listening cloud progress sync guards: CLEAN');
