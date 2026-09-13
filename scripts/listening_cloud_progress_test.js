const fs = require('fs');
const assert = require('assert');

const sync = fs.readFileSync('web/progress-sync.js', 'utf8');
const config = fs.readFileSync('web/config.js', 'utf8');
const storage = fs.readFileSync('web/storage.js', 'utf8');
const nsCodes = '119,97,115,101,115,104,105,98,117';
const has = (text, marker, label) => assert.ok(text.includes(marker), `missing ${label}: ${marker}`);
const lacks = (text, marker, label) => assert.ok(!text.includes(marker), `forbidden ${label}: ${marker}`);

has(sync, "APP_ID='listening'", 'listening app id');
has(sync, `String.fromCharCode(${nsCodes})`, 'encoded shared namespace');
has(sync, "STORAGE_KEY=KEY_NS+'-listening-progress'", 'stable listening storage key');
has(sync, "SYNC_DB=KEY_NS+'-progress-sync'", 'shared sync database');
has(sync, 'SYNC_DB_VERSION=7', 'shared sync database version');
has(sync, '/v1/register-anonymous', 'anonymous registration endpoint');
has(sync, '/v1/control', 'control endpoint');
has(sync, '/v1/progress/snapshot', 'baseline snapshot endpoint');
has(sync, '/v1/events/batch', 'event batch endpoint');
for (const marker of ['state:summary','state:mastery','state:retention','state:today','state:active-session']) has(sync, marker, marker);
has(sync, 'function buildOccurrenceRecords', 'occurrence builder');
has(sync, "reg?.status!=='production'", 'from-now occurrence production guard');
has(sync, 'occurrenceSignature:', 'occurrence signature control key');
has(sync, 'historyIdentity', 'stable history identity');
has(sync, 'pagehide', 'page-exit reconciliation');
has(sync, 'studying remains local-first', 'local-first failure isolation');

// Never upload raw listening content/state bodies. Only sanitized summaries are mapped.
lacks(sync, 'payload:{answers', 'raw answers payload');
lacks(sync, 'payload:{script', 'raw script payload');
lacks(sync, 'payload:{transcript', 'raw transcript payload');
lacks(sync, 'JSON.stringify(s.activeSession', 'active-session body upload');
lacks(sync, 'JSON.stringify(s.pending', 'pending body upload');

// The cloud layer must not take ownership of or migrate the learner's existing history schema.
has(storage, 'const CURRENT_SCHEMA = 6;', 'current local schema');
has(storage, 'PRIMARY_KEY = KEY_NS + "-listening-progress"', 'local primary key');
has(storage, 'pending: null', 'pending checkpoint');
has(storage, 'activeSession: null', 'active session checkpoint');
lacks(storage, 'events/batch', 'cloud endpoint in storage layer');
lacks(storage, 'ListeningProgressCloudSync', 'cloud ownership in storage layer');

// Loader is additive and failure-isolated; normal app boot remains independent.
has(config, 'progress-sync.js?v=22-cloud1', 'cloud sync loader');
has(config, 'document.createElement("script")', 'additive loader');
has(config, 'catch {}', 'loader failure isolation');

// State timestamps change each reconcile; occurredAt must not force timestamp-only revisions.
has(sync, "canonicalJson({eventType:record.eventType,payload:record.payload})", 'timestamp-independent state fingerprint');
lacks(sync, 'canonicalJson({eventType:record.eventType,occurredAt:record.occurredAt,payload:record.payload})', 'timestamp-sensitive state fingerprint');

// Cloud "today" must use the same local-calendar boundary as the learning app, not UTC.
has(sync, 'function localStudyDate', 'local study date helper');
has(sync, 'const today=localStudyDate()', 'local daily progress lookup');
lacks(sync, "const today=new Date().toISOString().slice(0,10)", 'UTC daily progress lookup');

// Retention is represented by mastery provisional/mastered state. `pending` is also used
// for remediation/drill/transfer checkpoints and must not be treated as retention debt.
has(sync, "function retentionRows(s)", 'retention mastery projection');
has(sync, "x.status==='provisional'||x.status==='mastered'", 'retention status filter');
has(sync, "retention.filter(x=>x.status==='provisional').length", 'pending retention count');
lacks(sync, 'total:s.pending?1:0', 'checkpoint-as-retention mapping');
lacks(sync, 'completed:!s.pending', 'checkpoint-as-retention completion');

console.log('Listening cloud progress sync guards: CLEAN');
