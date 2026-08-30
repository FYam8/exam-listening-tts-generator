(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ListeningProgressStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const CURRENT_SCHEMA = 2;
  // Intentionally unversioned: future app updates must keep using this key.
  const KEY_NS = String.fromCharCode(119,97,115,101,115,104,105,98,117);
  const PRIMARY_KEY = KEY_NS + "-listening-progress";
  const BACKUP_KEY = KEY_NS + "-listening-progress-backup";
  const LEGACY_KEYS = [KEY_NS + "-step-progress-v1"];
  const EXPORT_FORMAT = KEY_NS + "-listening-progress-backup";
  const EXPORT_VERSION = 1;

  function clone(v){
    if (v == null) return v;
    return JSON.parse(JSON.stringify(v));
  }

  function defaultProgress(){
    return {
      version: CURRENT_SCHEMA,
      schemaVersion: CURRENT_SCHEMA,
      attempts: {},
      mastery: {},
      history: [],
      pending: null,
      oldYearsUsedBefore2024: 0,
      bankCursor: {},
      seenBankIds: {},
      retentionSeen: {}
    };
  }

  function isObject(v){
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function normalizeProgress(raw){
    const src = isObject(raw) ? clone(raw) : {};
    const out = Object.assign(defaultProgress(), src); // preserve unknown future fields
    const incomingSchema = Number(src.schemaVersion || src.version || 1);
    out.schemaVersion = Math.max(CURRENT_SCHEMA, Number.isFinite(incomingSchema) ? incomingSchema : CURRENT_SCHEMA);
    out.version = out.schemaVersion;

    if (!isObject(out.attempts)) out.attempts = {};
    if (!isObject(out.mastery)) out.mastery = {};
    if (!Array.isArray(out.history)) out.history = [];
    if (!(out.pending == null || isObject(out.pending))) out.pending = null;
    if (!isObject(out.bankCursor)) out.bankCursor = {};
    if (!isObject(out.seenBankIds)) out.seenBankIds = {};
    if (!isObject(out.retentionSeen)) out.retentionSeen = {};
    if (!Number.isFinite(Number(out.oldYearsUsedBefore2024))) out.oldYearsUsedBefore2024 = 0;
    return out;
  }

  function safeParse(text){
    if (typeof text !== "string" || !text.trim()) return null;
    try {
      const parsed = JSON.parse(text);
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function storageSet(storage, key, value){
    storage.setItem(key, value);
  }

  function save(progress, storage){
    if (!storage) throw new Error("storage is required");
    const normalized = normalizeProgress(progress);
    const serialized = JSON.stringify(normalized);

    // Keep the last valid primary snapshot before overwriting it.
    const previous = storage.getItem(PRIMARY_KEY);
    if (previous && safeParse(previous)) {
      try { storageSet(storage, BACKUP_KEY, previous); } catch {}
    }

    storageSet(storage, PRIMARY_KEY, serialized);

    // Compatibility mirror: older releases used this key.
    // Keeping it current allows rollback to an older app without losing recent history.
    for (const legacyKey of LEGACY_KEYS) {
      try { storageSet(storage, legacyKey, serialized); } catch {}
    }
    return normalized;
  }

  function load(storage){
    if (!storage) return {progress: defaultProgress(), source: "memory-default", migrated: false, recovered: false};

    const candidates = [
      {key: PRIMARY_KEY, source: "stable-primary"},
      {key: BACKUP_KEY, source: "stable-backup"},
      ...LEGACY_KEYS.map(key => ({key, source: `legacy:${key}`}))
    ];

    for (const candidate of candidates) {
      const raw = safeParse(storage.getItem(candidate.key));
      if (!raw) continue;
      const progress = normalizeProgress(raw);
      const migrated = candidate.key !== PRIMARY_KEY || Number(raw.schemaVersion || raw.version || 1) < CURRENT_SCHEMA;
      const recovered = candidate.key === BACKUP_KEY;
      try { save(progress, storage); } catch {}
      return {progress, source: candidate.source, migrated, recovered};
    }

    const progress = defaultProgress();
    try { save(progress, storage); } catch {}
    return {progress, source: "new-default", migrated: false, recovered: false};
  }

  function canonicalize(value){
    if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
    if (isObject(value)) {
      return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function fnv1a32(text){
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function checksum(progress){
    return "fnv1a32:" + fnv1a32(canonicalize(normalizeProgress(progress)));
  }

  function makeExportPayload(progress, now){
    const normalized = normalizeProgress(progress);
    return {
      format: EXPORT_FORMAT,
      exportVersion: EXPORT_VERSION,
      schemaVersion: normalized.schemaVersion,
      exportedAt: now || new Date().toISOString(),
      includesPrivatePack: false,
      note: "Learning progress/history only. Official past-exam Private Pack is not included.",
      checksum: checksum(normalized),
      progress: normalized
    };
  }

  function exportText(progress, now){
    return JSON.stringify(makeExportPayload(progress, now), null, 2);
  }

  function parseImport(text){
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error("JSONとして読み込めません。"); }

    // New envelope format.
    if (isObject(parsed) && parsed.format === EXPORT_FORMAT) {
      if (!isObject(parsed.progress)) throw new Error("progress データがありません。");
      const normalized = normalizeProgress(parsed.progress);
      if (parsed.checksum && parsed.checksum !== checksum(normalized)) {
        throw new Error("チェックサムが一致しません。ファイルが破損または変更されています。");
      }
      return {progress: normalized, format: "backup-envelope"};
    }

    // Backward-compatible raw progress import.
    if (isObject(parsed) && (isObject(parsed.attempts) || Array.isArray(parsed.history))) {
      return {progress: normalizeProgress(parsed), format: "legacy-raw-progress"};
    }

    throw new Error("このアプリの学習履歴ファイルではありません。");
  }

  function dateMs(v){
    const n = Date.parse(v || "");
    return Number.isFinite(n) ? n : 0;
  }

  function unionArray(a, b){
    return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
  }

  function mergeRecordMap(a, b){
    return Object.assign({}, isObject(b) ? b : {}, isObject(a) ? a : {});
  }

  function mergeInitial(current, imported){
    if (!current) return clone(imported);
    if (!imported) return clone(current);

    const curDate = dateMs(current.date);
    const impDate = dateMs(imported.date);
    const earliest = (curDate && impDate) ? (curDate <= impDate ? current : imported)
      : (curDate ? current : (impDate ? imported : current));
    const other = earliest === current ? imported : current;

    // Preserve the earliest initial attempt's score/answers while unioning later remediation metadata.
    const merged = Object.assign({}, clone(other), clone(earliest));
    merged.causes = mergeRecordMap(current.causes, imported.causes);
    merged.rediagnosis = mergeRecordMap(current.rediagnosis, imported.rediagnosis);
    merged.completedGroups = unionArray(current.completedGroups, imported.completedGroups);
    merged.remediationComplete = !!(current.remediationComplete || imported.remediationComplete);
    return merged;
  }

  function dedupeRetakes(rows){
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (!isObject(r)) continue;
      const key = [r.date || "", r.score ?? "", r.aMisses ?? "", JSON.stringify(r.answers || {})].join("|");
      if (seen.has(key)) continue;
      seen.add(key); out.push(clone(r));
    }
    return out.sort((a,b) => dateMs(a.date) - dateMs(b.date));
  }

  function mergeAttempts(current, imported){
    const out = {};
    const years = new Set([...Object.keys(current || {}), ...Object.keys(imported || {})]);
    for (const year of years) {
      const a = isObject(current?.[year]) ? current[year] : {};
      const b = isObject(imported?.[year]) ? imported[year] : {};
      out[year] = Object.assign({}, clone(b), clone(a));
      out[year].initial = mergeInitial(a.initial, b.initial);
      out[year].retakes = dedupeRetakes([...(a.retakes || []), ...(b.retakes || [])]);
      if (!out[year].initial) delete out[year].initial;
      if (!out[year].retakes.length) delete out[year].retakes;
    }
    return out;
  }

  function mergeHistory(current, imported){
    const rows = [...(Array.isArray(current) ? current : []), ...(Array.isArray(imported) ? imported : [])];
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (!isObject(r)) continue;
      const key = [r.year ?? "", r.date || "", r.type || "", r.score ?? "", r.aMisses ?? ""].join("|");
      if (seen.has(key)) continue;
      seen.add(key); out.push(clone(r));
    }
    return out.sort((a,b) => dateMs(b.date) - dateMs(a.date));
  }

  function newerMastery(a, b){
    if (!a) return clone(b);
    if (!b) return clone(a);
    const ad = dateMs(a.updated), bd = dateMs(b.updated);
    if (ad !== bd) return clone(ad >= bd ? a : b);
    const rank = {mastered:3, provisional:2, "needs-practice":1};
    return clone((rank[a.status] || 0) >= (rank[b.status] || 0) ? a : b);
  }

  function mergeMastery(current, imported){
    const out = {};
    const tags = new Set([...Object.keys(current || {}), ...Object.keys(imported || {})]);
    for (const tag of tags) out[tag] = newerMastery(current?.[tag], imported?.[tag]);
    return out;
  }

  function mergeArrayMap(current, imported){
    const out = {};
    const keys = new Set([...Object.keys(current || {}), ...Object.keys(imported || {})]);
    for (const k of keys) out[k] = unionArray(current?.[k], imported?.[k]);
    return out;
  }

  function mergeProgress(currentRaw, importedRaw){
    const current = normalizeProgress(currentRaw);
    const imported = normalizeProgress(importedRaw);
    const out = Object.assign({}, clone(imported), clone(current)); // current unknown fields win by default
    out.schemaVersion = Math.max(current.schemaVersion || CURRENT_SCHEMA, imported.schemaVersion || CURRENT_SCHEMA, CURRENT_SCHEMA);
    out.version = out.schemaVersion;
    out.attempts = mergeAttempts(current.attempts, imported.attempts);
    out.history = mergeHistory(current.history, imported.history);
    out.mastery = mergeMastery(current.mastery, imported.mastery);
    out.seenBankIds = mergeArrayMap(current.seenBankIds, imported.seenBankIds);
    out.retentionSeen = mergeArrayMap(current.retentionSeen, imported.retentionSeen);
    out.bankCursor = Object.assign({}, imported.bankCursor || {}, current.bankCursor || {});
    out.oldYearsUsedBefore2024 = Math.max(Number(current.oldYearsUsedBefore2024 || 0), Number(imported.oldYearsUsedBefore2024 || 0));
    out.pending = current.pending || imported.pending || null;
    return normalizeProgress(out);
  }

  function importAndMerge(text, current){
    const parsed = parseImport(text);
    return {progress: mergeProgress(current, parsed.progress), sourceFormat: parsed.format};
  }

  return {
    CURRENT_SCHEMA,
    PRIMARY_KEY,
    BACKUP_KEY,
    LEGACY_KEYS: [...LEGACY_KEYS],
    EXPORT_FORMAT,
    defaultProgress,
    normalizeProgress,
    save,
    load,
    checksum,
    makeExportPayload,
    exportText,
    parseImport,
    mergeProgress,
    importAndMerge
  };
});
