(() => {
"use strict";

const KANA = ["ア","イ","ウ","エ","オ","カ"];
const UPDATE_WORDS = ["however","actually","instead","at first","finally","not","only","before","after","originally","still","then","but"];
const SKILL_LABELS = {
  NEXT:"次の自然な発言", CHANGE:"最終決定・情報変更", NOT:"した／しなかった",
  TIME:"時刻・所要時間", MONEY:"金額・数量", PLACE:"場所", REASON:"理由",
  PURPOSE:"目的・話者", DETAIL:"内容一致", MAIN:"要点", TRUEFALSE:"True / Not true"
};
const CAUSE_LABELS = {
  HEAR:"音として聞こえなかった",
  VOCAB:"語彙・表現が分からなかった",
  MEANING:"英文の意味処理が追いつかなかった",
  UPDATE:"後の情報へ更新できなかった",
  CALC:"数字は取れたが計算で失敗した",
  QUESTION:"設問で聞かれていることを取り違えた",
  MEMO:"必要情報を保持・メモできなかった",
  CARELESS:"答えは分かっていたが押し間違えた",
  UNKNOWN:"自分では原因が分からない"
};
const CAUSE_HELP = {
  HEAR:"スクリプトを見れば分かるが、音として認識できなかった。",
  VOCAB:"音は取れても、単語・熟語・表現の意味を知らなかった。",
  MEANING:"単語は分かるが、文全体の意味処理が追いつかなかった。",
  UPDATE:"but / actually / instead などの後の情報へ更新できなかった。",
  CALC:"必要な数字は取れたが、足し引き・逆算・合計で失敗した。",
  QUESTION:"arrival / departure / not true など、何を答えるかを取り違えた。",
  MEMO:"聞いた時点では分かったが、必要情報を保持できなかった。",
  CARELESS:"情報も答えも分かっていたのに、選択ミスなどをした。",
  UNKNOWN:"無理に決めず、次の未見問題の結果から原因を見直す。"
};
const LS_PACK = String.fromCharCode(119,97,115,101,115,104,105,98,117) + "-official-pack-v1";
const WS = window.ListeningProgressStorage;
const VOICE_PROFILES = window.ListeningVoiceProfiles;
const STUDY_PLAN = window.ListeningStudyPlan;
const TARGET_STRATEGY = window.ListeningTargetStrategy;
const APP_CONFIG = window.LISTENING_APP_CONFIG || {bundledPackBase64Var:null,hidePackControlsWhenBundled:true};
const REQUIRED_YEARS = [2019,2020,2021,2022,2023,2024,2025,2026];
const DAILY_STEP_GOAL = 3;

const els = {};
const state = {
  pack:null,
  packSource:null,
  progress:null,
  storageInfo:null,
  voices:[],
  voiceLoadAttempts:0,
  selectedVoices:{man:null,woman:null,narrator:null},
  rate:1,
  speaking:false,
  exam:null,
  rediagnosis:null,
  script:null,
  drill:null,
  transfer:null,
  retention:null,
  currentView:"dashboardView"
};

function $(id){ return document.getElementById(id); }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function toast(msg){
  els.toast.textContent = msg; els.toast.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(()=>els.toast.classList.remove("show"), 2600);
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function localStudyDate(now=new Date()){
  const y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,"0"),d=String(now.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function dailyCompletedIds(date=localStudyDate()){
  const ids=state.progress?.dailyActivity?.[date]?.completedBlockIds;
  return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==="string"&&id))]:[];
}
function markDailyStep(blockId,date=localStudyDate()){
  if(!state.progress || !blockId) return false;
  state.progress.dailyActivity ||= {};
  const row=state.progress.dailyActivity[date] ||= {completedBlockIds:[]};
  const ids=new Set(Array.isArray(row.completedBlockIds)?row.completedBlockIds:[]);
  if(ids.has(blockId)) return false;
  ids.add(blockId);
  row.completedBlockIds=[...ids];
  return true;
}
function addDaysISO(days){
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
function showView(id){
  state.currentView=id;
  ["dashboardView","examView","scoreOnlyView","rediagnosisView","scriptView","drillView","transferView","retentionView","reviewView","historyView"]
    .forEach(v => els[v].classList.toggle("hidden", v !== id));
  window.scrollTo({top:0, behavior:"instant"});
}
function saveProgress(){
  state.progress = WS.save(state.progress, window.localStorage);
}
function defaultProgress(){
  return WS.defaultProgress();
}
function loadProgress(){
  state.storageInfo = WS.load(window.localStorage);
  return state.storageInfo.progress;
}
function renderStorageStatus(){
  if(!els.storageStatus || !state.storageInfo) return;
  const info=state.storageInfo;
  const sourceLabel={
    "stable-primary":"固定保存領域",
    "stable-backup":"自動バックアップから復旧",
    "new-default":"新規データ",
    "memory-default":"一時データ"
  }[info.source] || (String(info.source||"").startsWith("legacy:") ? "旧バージョンから自動移行" : "固定保存領域");
  els.storageStatus.textContent=`${sourceLabel} · schema v${state.progress.schemaVersion || WS.CURRENT_SCHEMA}。アプリ更新で保存キーを変更しない設計です。`;
}
function downloadText(filename,text){
  const blob=new Blob([text],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
function exportProgress(){
  try{
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    downloadText(`listening-progress-${stamp}.json`,WS.exportText(state.progress));
    toast("学習履歴・進捗をエクスポートしました。Private Packは含まれません。");
  }catch(err){
    console.error(err);toast(`エクスポート失敗: ${err.message}`);
  }
}
async function importProgressFile(file){
  if(!file) return;
  try{
    if(file.size>10_000_000) throw new Error("ファイルが大きすぎます。");
    const text=await file.text();
    const merged=WS.importAndMerge(text,state.progress);
    state.progress=WS.save(merged.progress,window.localStorage);
    state.storageInfo={progress:state.progress,source:"stable-primary",migrated:false,recovered:false};
    renderDashboard();renderStorageStatus();
    toast("学習履歴を安全統合しました。既存の初回得点は上書きしていません。");
  }catch(err){
    console.error(err);toast(`インポート失敗: ${err.message}`);
  }
}
function validatePack(pack){
  if(!pack || !Array.isArray(pack.years)) throw new Error("years がありません。");
  const yrs = pack.years.map(y=>Number(y.year));
  for(const y of REQUIRED_YEARS) if(!yrs.includes(y)) throw new Error(`${y}年度がありません。`);
  for(const y of pack.years){
    let qn = 0, pts = 0;
    if(!Array.isArray(y.stimuli) || y.stimuli.length !== 8) throw new Error(`${y.year}: stimuli は8題必要です。`);
    for(const s of y.stimuli){
      if(!Array.isArray(s.questions) || !s.questions.length) throw new Error(`${y.year}: questions 不正`);
      for(const q of s.questions){
        qn++; pts += Number(q.points||0);
        if(!Array.isArray(q.choices) || q.choices.length !== 4) throw new Error(`${q.id}: 4択ではありません。`);
        if(!Number.isInteger(q.correct) || q.correct<0 || q.correct>3) throw new Error(`${q.id}: correct 不正`);
      }
    }
    if(qn !== 10 || pts !== 20) throw new Error(`${y.year}: 10問/20点ではありません。`);
  }
  return true;
}
function yearData(year){
  return state.pack?.years.find(y=>Number(y.year)===Number(year)) || null;
}
function qMap(year){
  const map = {};
  const y = yearData(year);
  if(!y) return map;
  y.stimuli.forEach(s => s.questions.forEach(q => map[q.id] = {q, stimulus:s}));
  return map;
}
function getInitial(year){ return state.progress.attempts?.[year]?.initial || null; }
function allInitialYears(){ return REQUIRED_YEARS.filter(y=>getInitial(y)); }

function speechAvailable(){ return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }
function loadVoices(){
  if(!speechAvailable()){
    els.voiceStatus.textContent = "このブラウザは音声合成に対応していません。SafariまたはChromeで開き直してください。";
    return;
  }
  state.voices = window.speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang));
  [els.maleVoice, els.femaleVoice, els.narratorVoice].forEach(sel => { sel.innerHTML=""; });
  const addOptions = (select, rows) => rows.forEach(({voice,index,gender})=>{
    const suffix = gender === "unknown" ? " · 性別情報なし" : "";
    const o=document.createElement("option");
    o.value=String(index);
    o.textContent=`${voice.name} (${voice.lang})${voice.localService ? " · local" : ""}${suffix}`;
    select.appendChild(o);
  });
  const manRows=VOICE_PROFILES.rowsFor(state.voices,"man");
  const womanRows=VOICE_PROFILES.rowsFor(state.voices,"woman");
  const narratorRows=VOICE_PROFILES.rowsFor(state.voices,"narrator");
  addOptions(els.maleVoice,manRows);
  addOptions(els.femaleVoice,womanRows);
  addOptions(els.narratorVoice,narratorRows);
  if(state.voices.length){
    state.voiceLoadAttempts=0;
    let mi=VOICE_PROFILES.preferredIndex(manRows,"man");
    let wi=VOICE_PROFILES.preferredIndex(womanRows,"woman");
    const ni=VOICE_PROFILES.preferredIndex(narratorRows,"narrator");
    if(mi===wi && state.voices.length>1){
      const alternative=womanRows.find(row=>row.index!==mi);
      if(alternative) wi=alternative.index;
    }
    els.maleVoice.value=String(mi); els.femaleVoice.value=String(wi); els.narratorVoice.value=String(ni);
    syncVoices();
    const detected=VOICE_PROFILES.counts(state.voices);
    els.voiceStatus.textContent=detected.man && detected.woman
      ? `英語音声 ${state.voices.length}件を検出。Manは男性候補、Womanは女性候補だけを表示しています。`
      : `英語音声 ${state.voices.length}件を検出しましたが、端末の音声名から性別を完全には判定できません。必要に応じてOSへ英語の男性・女性音声を追加してください。`;
  }else{
    state.voiceLoadAttempts++;
    els.voiceStatus.textContent=state.voiceLoadAttempts>=3
      ? "英語音声を利用できません。iPhoneのアプリ内ブラウザではSafariで開き、その他の端末ではOSに英語音声を追加してから再読み込みしてください。"
      : "英語音声を読み込み中です。数秒後に再確認してください。";
  }
}

function currentTargetScore(){
  return TARGET_STRATEGY?.normalizeTarget(state.progress?.targetScore) || 70;
}
function targetGoalLabel(){
  return TARGET_STRATEGY?.goalLabel(currentTargetScore()) || "B 70点";
}
function gradeInTarget(grade,target=currentTargetScore()){
  return TARGET_STRATEGY ? TARGET_STRATEGY.gradeInTarget(target,grade) : (String(grade||"B").toUpperCase()!=="C");
}
function qGrade(q){
  const d=String(q?.difficulty||"B").toUpperCase();
  return ["A","B","C"].includes(d)?d:"B";
}
function targetWrongQids(year){
  const att=getInitial(year),map=qMap(year);
  return (att?.wrongQids||[]).filter(qid=>{
    const q=map[qid]?.q;
    return q && gradeInTarget(qGrade(q));
  });
}
function legacyCompletedQidSet(year){
  const att=getInitial(year),map=qMap(year),by={},order=[];
  if(!att) return new Set();
  (att.wrongQids||[]).forEach(qid=>{
    const item=map[qid]; if(!item)return;
    if(!by[item.stimulus.id]){
      by[item.stimulus.id]={qids:[]};
      order.push(item.stimulus.id);
    }
    by[item.stimulus.id].qids.push(qid);
  });
  const done=new Set();
  for(const idx of att.completedGroups||[]){
    const id=order[Number(idx)];
    if(id && by[id]) by[id].qids.forEach(qid=>done.add(qid));
  }
  return done;
}
function completedRemediationQidSet(year){
  const att=getInitial(year),done=legacyCompletedQidSet(year);
  (att?.completedRemediationQids||[]).forEach(qid=>done.add(qid));
  return done;
}
function remainingTargetWrongQids(year){
  const done=completedRemediationQidSet(year);
  return targetWrongQids(year).filter(qid=>!done.has(qid));
}
function targetRemediationComplete(year){
  return remainingTargetWrongQids(year).length===0;
}
function fullWrongGroups(year){
  const att=getInitial(year),map=qMap(year),by={},groups=[];
  (att?.wrongQids||[]).forEach(qid=>{
    const item=map[qid];if(!item)return;
    if(!by[item.stimulus.id]){
      const g={id:item.stimulus.id,stimulus:item.stimulus,qids:[],sourceIndex:groups.length};
      by[item.stimulus.id]=g;groups.push(g);
    }
    by[item.stimulus.id].qids.push(qid);
  });
  return groups;
}
function buildTargetWrongGroups(year,{remainingOnly=true}={}){
  const map=qMap(year),allowed=new Set(remainingOnly?remainingTargetWrongQids(year):targetWrongQids(year));
  return fullWrongGroups(year).map(g=>({
    id:g.id,stimulus:g.stimulus,sourceIndex:g.sourceIndex,
    qids:g.qids.filter(qid=>allowed.has(qid)&&gradeInTarget(qGrade(map[qid]?.q)))
  })).filter(g=>g.qids.length);
}
function pendingSourceGrades(p){
  if(!p) return [];
  if(Array.isArray(p.sourceDifficulties)) return [...new Set(p.sourceDifficulties.map(String))];
  if(p.sourceProfile?.difficulties) return [...new Set(p.sourceProfile.difficulties.map(String))];
  if(p.year && Array.isArray(p.groupQids)){
    const map=qMap(p.year);
    return [...new Set(p.groupQids.map(qid=>qGrade(map[qid]?.q)).filter(Boolean))];
  }
  return [];
}
function pendingAllowedForTarget(p){
  const grades=pendingSourceGrades(p);
  // If the target is lowered mid-remediation, restart from the new target subset instead
  // of silently continuing a B/C question that is no longer required.
  return !grades.length || grades.every(g=>gradeInTarget(g));
}
function reconcilePendingForTarget(){
  const p=state.progress?.pending;
  if(p && !pendingAllowedForTarget(p)) state.progress.pending=null;
}
function activeSessionAllowedForTarget(){
  const s=state.progress?.activeSession;
  if(!s || ["exam","retention"].includes(s.type)) return true;
  if(["rediagnosis","script"].includes(s.type)){
    const map=qMap(s.year);
    const grades=(s.groupQids||[]).map(qid=>qGrade(map[qid]?.q));
    return !grades.length || grades.every(g=>gradeInTarget(g));
  }
  if(["drill","transfer"].includes(s.type)){
    return pendingAllowedForTarget(state.progress.pending);
  }
  return true;
}
function reconcileActiveSessionForTarget(){
  if(state.progress?.activeSession && !activeSessionAllowedForTarget()){
    state.progress.activeSession=null;
  }
}
function setTargetScore(score){
  const next=TARGET_STRATEGY?.normalizeTarget(score) || 70;
  if(currentTargetScore()===next) return;
  state.progress.targetScore=next;
  state.progress.targetUpdatedAt=new Date().toISOString();
  reconcilePendingForTarget();
  reconcileActiveSessionForTarget();
  saveProgress();
  renderDashboard();
  toast(`学習目標を ${TARGET_STRATEGY.goalLabel(next)} に変更しました。必須補強問題を再計算しました。`);
}
function renderTargetStrategy(){
  if(!els.targetGoalButtons) return;
  const target=currentTargetScore();
  els.targetGoalBadge.textContent=TARGET_STRATEGY.goalLabel(target);
  els.targetGoalSummary.textContent=TARGET_STRATEGY.summary(target);
  els.targetGoalButtons.querySelectorAll("[data-target]").forEach(btn=>{
    const active=Number(btn.dataset.target)===target;
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-pressed",active?"true":"false");
  });
}

function checkpointNow(){
  return new Date().toISOString();
}
function cloneCheckpointValue(value){
  if(value==null) return null;
  try{return JSON.parse(JSON.stringify(value));}catch{return null;}
}
function pendingCheckpoint(){
  return cloneCheckpointValue(state.progress?.pending);
}
function setActiveSession(session,{save=true}={}){
  if(!state.progress) return;
  state.progress.activeSession=session?{...session,updatedAt:checkpointNow()}:null;
  if(save) saveProgress();
}
function clearActiveSession({save=true}={}){
  if(!state.progress) return;
  state.progress.activeSession=null;
  if(save) saveProgress();
}
function examSessionSnapshot(stage="exam"){
  const e=state.exam;
  if(!e) return null;
  return {
    type:"exam",stage,year:e.year,retake:!!e.retake,idx:e.idx,
    answers:{...(e.answers||{})},played:{...(e.played||{})},started:e.started||checkpointNow()
  };
}
function rediagnosisSessionSnapshot(stage="rediagnosis"){
  const r=state.rediagnosis,g=r?.groups?.[r.idx];
  if(!r||!g) return null;
  return {
    type:"rediagnosis",stage,year:r.year,targetScore:r.targetScore||currentTargetScore(),
    groupId:g.id||g.stimulus.id,groupIndex:g.sourceIndex??r.idx,groupQids:[...(g.qids||[])],
    answers:{...(r.answers||{})},played:{...(r.played||{})}
  };
}
function scriptSessionSnapshot(){
  const sp=state.script;
  if(!sp) return null;
  return {
    type:"script",stage:"script",year:sp.year,targetScore:sp.targetScore||currentTargetScore(),
    groupId:sp.groupId||sp.group?.id||sp.group?.stimulus?.id,groupIndex:sp.groupIndex,
    groupQids:[...(sp.group?.qids||[])],hidden:!!sp.hidden,highlight:!!sp.highlight,
    pendingContext:pendingCheckpoint()
  };
}
function drillSessionSnapshot(stage="drill"){
  const d=state.drill;
  if(!d) return null;
  return {
    type:"drill",stage,tag:d.tag,itemIds:(d.items||[]).map(x=>x.id),idx:d.idx,
    answers:[...(d.answers||[])],correct:d.correct||0,usedIds:[...(d.usedIds||[])],
    played:{...(d.played||{})},phase:d.phase||"initial",
    firstCorrect:d.firstCorrect||0,firstTotal:d.firstTotal||0,
    pendingContext:pendingCheckpoint()
  };
}
function transferSessionSnapshot(stage="transfer"){
  const t=state.transfer;
  if(!t) return null;
  return {
    type:"transfer",stage,mode:t.mode,tags:[...(t.tags||[])],context:t.context,
    retentionOnly:!!t.retentionOnly,sourceProfile:t.sourceProfile||null,
    itemIds:(t.items||[]).map(x=>x.id),idx:t.idx,answers:{...(t.answers||{})},
    played:{...(t.played||{})},correct:t.correct||0,totalQuestions:t.totalQuestions||0,
    pendingContext:pendingCheckpoint()
  };
}
function retentionSessionSnapshot(stage="retention"){
  const r=state.retention;
  if(!r) return null;
  return {type:"retention",stage,tag:r.tag,itemId:r.item?.id,answer:r.answer,played:!!r.played};
}
function saveCurrentSessionCheckpoint(){
  const existing=state.progress?.activeSession;
  if(state.currentView==="examView"&&state.exam){
    setActiveSession(examSessionSnapshot(),{save:true});return;
  }
  if(state.currentView==="rediagnosisView"&&state.rediagnosis){
    const stage=existing?.type==="rediagnosis"&&existing.stage==="script-ready"?"script-ready":"rediagnosis";
    setActiveSession(rediagnosisSessionSnapshot(stage),{save:true});return;
  }
  if(state.currentView==="scriptView"&&state.script){
    setActiveSession(scriptSessionSnapshot(),{save:true});return;
  }
  if(state.currentView==="drillView"&&state.drill){
    const stage=existing?.type==="drill"&&existing.stage==="drill-submitted"?"drill-submitted":"drill";
    setActiveSession(drillSessionSnapshot(stage),{save:true});return;
  }
  if(state.currentView==="transferView"&&state.transfer){
    const stage=existing?.type==="transfer"&&existing.stage==="transfer-submitted"?"transfer-submitted":"transfer";
    setActiveSession(transferSessionSnapshot(stage),{save:true});return;
  }
  if(state.currentView==="retentionView"&&state.retention){
    const stage=existing?.type==="retention"&&existing.stage==="retention-failed"?"retention-failed":"retention";
    setActiveSession(retentionSessionSnapshot(stage),{save:true});
  }
}
function findOriginalBankItem(tag,id,retentionOnly=false){
  return bankForTag(tag,retentionOnly).find(x=>x.id===id)||null;
}
function findTransferItem(mode,retentionOnly,id){
  return transferBank(mode,retentionOnly).find(x=>x.id===id)||null;
}
function rebuildRemediationGroup(session){
  const all=fullWrongGroups(session.year);
  const original=(session.groupId&&all.find(x=>x.id===session.groupId))||all[Number(session.groupIndex)];
  if(!original) return null;
  const map=qMap(session.year);
  const qids=(session.groupQids||original.qids).filter(qid=>map[qid]?.q);
  return {...original,qids};
}
function hydrateScriptCheckpoint(s){
  if(!s || s.type!=="script") return null;
  if(s.pendingContext) state.progress.pending=cloneCheckpointValue(s.pendingContext);
  const g=rebuildRemediationGroup(s);
  if(!g) return null;
  state.rediagnosis={
    year:s.year,groups:[g],idx:0,answers:{},played:{},revealed:true,
    targetScore:s.targetScore||currentTargetScore()
  };
  state.script={
    year:s.year,groupIndex:s.groupIndex,groupId:s.groupId||g.id,group:g,
    hidden:!!s.hidden,highlight:!!s.highlight,targetScore:s.targetScore||currentTargetScore()
  };
  return g;
}
function scriptCheckpointMissingCauses(s){
  if(!s || s.type!=="script") return null;
  const all=fullWrongGroups(s.year);
  const original=(s.groupId&&all.find(x=>x.id===s.groupId))||all[Number(s.groupIndex)];
  if(!original) return null;
  const map=qMap(s.year);
  const qids=(s.groupQids||original.qids).filter(qid=>map[qid]?.q);
  const g={...original,qids};
  return groupCauseRecords(s.year,g).filter(r=>r.persistentMiss && !r.cause);
}
function advanceFromScriptCheckpoint(){
  const s=state.progress?.activeSession;
  if(!s || s.type!=="script") return false;
  const missing=scriptCheckpointMissingCauses(s);
  if(missing==null){
    clearActiveSession();
    return false;
  }
  if(!hydrateScriptCheckpoint(s)){
    clearActiveSession();
    return false;
  }
  if(missing.length){
    showView("scriptView");renderScript();
    toast("この問題は再診断でも不正解でした。ミス原因を1つ選んでから類題へ進みます。");
    setTimeout(()=>els.causePanel?.scrollIntoView({behavior:"smooth",block:"center"}),0);
    return true;
  }
  // This script screen has already been opened once. With no unresolved required input,
  // Today's button means "move forward to the next actual practice question".
  startDrillsFromScript();
  return true;
}
function activeSessionTask(){
  const s=state.progress?.activeSession;
  if(!s) return null;
  if(s.type==="exam"){
    const y=yearData(s.year),stim=y?.stimuli?.[Number(s.idx)||0];
    return {type:"resume-active-session",year:s.year,title:`${s.year}年度 ${stim?`Number ${stim.number}`:"途中"}から続ける`,meta:"途中の回答・再生済み状態を保存しています。"};
  }
  if(s.type==="rediagnosis"){
    const g=rebuildRemediationGroup(s);
    const no=g?.stimulus?.number;
    if(s.stage==="script-ready") return {type:"resume-active-session",year:s.year,title:`回答済みの再診断からスクリプト練習へ`,meta:`${s.year}年度${no?` Number ${no}`:""}。同じ問題を再回答せず、次の学習段階へ進みます。`};
    return {type:"resume-active-session",year:s.year,title:`再診断 ${no?`Number ${no}`:"途中"}から続ける`,meta:"未確定の回答はそのまま復元します。"};
  }
  if(s.type==="script"){
    const missing=scriptCheckpointMissingCauses(s);
    if(missing?.length){
      return {type:"resume-active-session",year:s.year,title:"ミス原因を選んで類題へ",meta:"再診断でも不正解だった問題です。原因を1つ選ぶと次のオリジナル類題へ進めます。"};
    }
    return {type:"resume-active-session",year:s.year,title:"スクリプト確認済み → 次の類題へ",meta:"このスクリプト画面はすでに開いています。次はオリジナル類題へ進みます。"};
  }
  if(s.type==="drill"){
    return {type:"resume-active-session",title:s.stage==="drill-submitted"?"回答済み → 結果を確認して次へ":`${SKILL_LABELS[s.tag]||s.tag} の類題を続ける`,meta:"選んだ類題・回答・再生済み状態を保存しています。"};
  }
  if(s.type==="transfer"){
    return {type:"resume-active-session",title:s.stage==="transfer-submitted"?"回答済み → 結果を確認して次へ":"本番相当類題を続ける",meta:"同じ回答済みセットには戻らず、次の処理へ進みます。"};
  }
  if(s.type==="retention"){
    return {type:"resume-active-session",title:s.stage==="retention-failed"?"定着確認の失点 → 3問類題へ":"定着確認を続ける",meta:"途中状態から正確に再開します。"};
  }
  return null;
}
function restoreActiveSession(){
  const s=state.progress?.activeSession;
  if(!s) return false;
  if(s.type==="exam"){
    const y=yearData(s.year);if(!y){clearActiveSession();return false;}
    state.exam={year:s.year,retake:!!s.retake,stimuli:y.stimuli,idx:Math.max(0,Math.min(Number(s.idx)||0,y.stimuli.length-1)),answers:{...(s.answers||{})},played:{...(s.played||{})},started:s.started||checkpointNow()};
    showView("examView");renderExam();return true;
  }
  if(s.type==="rediagnosis"){
    const g=rebuildRemediationGroup(s);if(!g){clearActiveSession();return false;}
    state.rediagnosis={year:s.year,groups:[g],idx:0,answers:{...(s.answers||{})},played:{...(s.played||{})},revealed:s.stage==="script-ready",targetScore:s.targetScore||currentTargetScore()};
    if(s.stage==="script-ready"){openScriptForCurrentGroup();return true;}
    showView("rediagnosisView");renderRediagnosis();return true;
  }
  if(s.type==="script"){
    return advanceFromScriptCheckpoint();
  }
  if(s.type==="drill"){
    if(s.pendingContext) state.progress.pending=cloneCheckpointValue(s.pendingContext);
    const items=(s.itemIds||[]).map(id=>findOriginalBankItem(s.tag,id,false)).filter(Boolean);
    if(!items.length){clearActiveSession();return false;}
    state.drill={tag:s.tag,items,idx:Math.max(0,Math.min(Number(s.idx)||0,items.length-1)),answers:[...(s.answers||[])],correct:Number(s.correct)||0,usedIds:[...(s.usedIds||s.itemIds||[])],played:{...(s.played||{})},phase:s.phase||"initial",firstCorrect:Number(s.firstCorrect)||0,firstTotal:Number(s.firstTotal)||0};
    if(s.stage==="drill-submitted"){clearActiveSession({save:false});advanceDrill();return true;}
    showView("drillView");renderDrill();return true;
  }
  if(s.type==="transfer"){
    if(s.pendingContext) state.progress.pending=cloneCheckpointValue(s.pendingContext);
    const items=(s.itemIds||[]).map(id=>findTransferItem(s.mode,!!s.retentionOnly,id)).filter(Boolean);
    if(!items.length){clearActiveSession();return false;}
    state.transfer={mode:s.mode,tags:[...(s.tags||[])],context:s.context,retentionOnly:!!s.retentionOnly,sourceProfile:s.sourceProfile||null,items,idx:Math.max(0,Math.min(Number(s.idx)||0,items.length-1)),answers:{...(s.answers||{})},played:{...(s.played||{})},correct:Number(s.correct)||0,totalQuestions:Number(s.totalQuestions)||items.reduce((n,x)=>n+x.questions.length,0)};
    if(s.stage==="transfer-submitted"){clearActiveSession({save:false});advanceTransfer();return true;}
    showView("transferView");renderTransfer();return true;
  }
  if(s.type==="retention"){
    if(s.stage==="retention-failed"){
      const tag=s.tag;clearActiveSession({save:false});state.progress.pending=null;saveProgress();startDrill(tag);return true;
    }
    const item=findOriginalBankItem(s.tag,s.itemId,true);
    if(!item){clearActiveSession();return false;}
    state.retention={tag:s.tag,item,answer:s.answer??null,played:!!s.played};
    showView("retentionView");renderRetention();return true;
  }
  clearActiveSession();return false;
}


function syncVoices(){
  state.selectedVoices.man = state.voices[Number(els.maleVoice.value)] || null;
  state.selectedVoices.woman = state.voices[Number(els.femaleVoice.value)] || null;
  state.selectedVoices.narrator = state.voices[Number(els.narratorVoice.value)] || null;
}
function splitSentences(text){
  return String(text).split(/(?<=[.!?…])\s+/).map(s=>s.trim()).filter(Boolean);
}
function speak(text, role="narrator", rateMul=1){
  return new Promise((resolve,reject)=>{
    if(!speechAvailable()){ reject(new Error("speech-unavailable")); return; }
    const u = new SpeechSynthesisUtterance(text);
    const key = role === "male" ? "man" : role === "female" ? "woman" : role;
    const v = state.selectedVoices[key] || state.selectedVoices.narrator || state.voices[0];
    if(v){ u.voice=v; u.lang=v.lang; } else u.lang="en-US";
    u.rate = Math.max(.6, Math.min(1.35, state.rate * rateMul));
    u.pitch = key==="man" ? .95 : key==="woman" ? 1.03 : 1.0;
    u.onend=()=>resolve();
    u.onerror=e=>{
      if(["canceled","interrupted"].includes(e.error)) resolve();
      else reject(new Error("音声合成エラー"));
    };
    window.speechSynthesis.speak(u);
  });
}
async function speakPassage(text, role="narrator", rateMul=1){
  for(const s of splitSentences(text)){
    await speak(s, role, rateMul); await sleep(150);
  }
}

function makeUtterance(text, role="narrator", rateMul=1){
  const u = new SpeechSynthesisUtterance(text);
  const key = role === "male" ? "man" : role === "female" ? "woman" : role;
  const v = state.selectedVoices[key] || state.selectedVoices.narrator || state.voices[0];
  if(v){ u.voice=v; u.lang=v.lang; } else u.lang="en-US";
  u.rate = Math.max(.6, Math.min(1.35, state.rate * rateMul));
  u.pitch = key==="man" ? .95 : key==="woman" ? 1.03 : 1.0;
  return u;
}

function stimulusUtteranceSpecs(stimulus, rateMul=1){
  const specs=[{text:`Number ${stimulus.number}.`,role:"narrator",rate:.94*rateMul,delayAfter:400}];
  if(stimulus.kind==="short"){
    for(const t of stimulus.turns||[]) specs.push({text:t.text,role:t.role,rate:rateMul,delayAfter:220});
  }else{
    for(const sentence of splitSentences(stimulus.passage||"")) specs.push({text:sentence,role:"narrator",rate:rateMul,delayAfter:150});
  }
  if(specs.length) specs[specs.length-1].delayAfter=350;
  const qs=stimulus.questions||[];
  qs.forEach((q,qi)=>{
    const between=(qs.length>1 && qi<qs.length-1) ? 6000 : 250;
    specs.push({text:`Question. ${q.text}`,role:"narrator",rate:.92*rateMul,delayAfter:between});
  });
  return specs;
}

function playStimulusQueued(stimulus, statusEl, rateMul=1){
  return new Promise((resolve,reject)=>{
    if(!speechAvailable()){
      reject(new Error("speech-unavailable"));
      return;
    }
    const specs=stimulusUtteranceSpecs(stimulus,rateMul);
    if(!specs.length){
      reject(new Error("speech-empty"));
      return;
    }

    let index=0;
    let started=false;
    let settled=false;
    let timer=null;

    const finish=()=>{
      if(settled) return;
      settled=true;
      state.speaking=false;
      if(timer) clearTimeout(timer);
      if(statusEl) statusEl.textContent="再生終了";
      resolve();
    };
    const fail=(err)=>{
      if(settled) return;
      settled=true;
      state.speaking=false;
      if(timer) clearTimeout(timer);
      try{ window.speechSynthesis.cancel(); }catch{}
      if(statusEl) statusEl.textContent="音声を開始できませんでした";
      reject(err instanceof Error ? err : new Error("speech-error"));
    };

    const speakNext=()=>{
      if(settled) return;
      if(index>=specs.length){ finish(); return; }
      const spec=specs[index++];
      const u=makeUtterance(spec.text,spec.role,spec.rate);
      u.onstart=()=>{
        started=true;
        if(statusEl) statusEl.textContent="再生中…";
      };
      u.onerror=e=>{
        if(["canceled","interrupted"].includes(e.error)){ fail(new Error(e.error)); return; }
        fail(new Error(e.error || "speech-error"));
      };
      u.onend=()=>{
        const wait=Math.max(0,Number(spec.delayAfter||0));
        if(index>=specs.length){ finish(); return; }
        timer=setTimeout(speakNext,wait);
      };
      try{
        window.speechSynthesis.speak(u);
      }catch(err){
        fail(err);
      }
    };

    state.speaking=true;

    // The first utterance is invoked synchronously from the user's tap.
    speakNext();

    // A WebView may expose speechSynthesis but never start speaking.
    timer=setTimeout(()=>{
      if(!started && !settled) fail(new Error("speech-start-timeout"));
    },2200);
  });
}

function speechFailureMessage(){
  return "音声合成を開始できませんでした。iPhoneのアプリ内ブラウザではSafariで開き、その他の端末ではOSの英語音声設定を確認してください。";
}

async function speakStimulus(stimulus, statusEl, rateMul=1){
  if(state.speaking) return;
  state.speaking=true;
  window.speechSynthesis?.cancel();
  if(statusEl) statusEl.textContent="再生中…";
  try{
    await speak(`Number ${stimulus.number}.`, "narrator", .94*rateMul);
    await sleep(400);
    if(stimulus.kind==="short"){
      for(const t of stimulus.turns){
        await speak(t.text, t.role, rateMul); await sleep(220);
      }
    }else{
      await speakPassage(stimulus.passage, "narrator", rateMul);
    }
    await sleep(350);
    for(let qi=0; qi<stimulus.questions.length; qi++){
      const q = stimulus.questions[qi];
      await speak(`Question. ${q.text}`, "narrator", .92*rateMul);
      // Exact official silence length is not available in the supplied scripts.
      // This is a practice-oriented answer gap, used only between Q1 and Q2.
      if(stimulus.questions.length > 1 && qi < stimulus.questions.length - 1) await sleep(6000);
      else await sleep(250);
    }
    if(statusEl) statusEl.textContent="再生終了";
  }finally{
    state.speaking=false;
  }
}

function computeWeakness(){
  const counts = {};
  for(const year of allInitialYears()){
    const att=getInitial(year),map=qMap(year);
    for(const qid of att.wrongQids||[]){
      const item=map[qid]; if(!item || !gradeInTarget(qGrade(item.q))) continue;
      const weight=item.q.difficulty==="A"?2:item.q.difficulty==="B"?1.4:1;
      (item.q.tags||[]).forEach(tag=>{
        const r=counts[tag] ||= {miss:0,weight:0,years:new Set(),grades:new Set()};
        r.miss+=1;r.weight+=weight;r.years.add(year);r.grades.add(qGrade(item.q));
      });
    }
  }
  return Object.entries(counts).map(([tag,r])=>({
    tag,miss:r.miss,weight:r.weight,years:[...r.years],grades:[...r.grades]
  })).sort((a,b)=>b.weight-a.weight||b.miss-a.miss);
}
function yearTagProfile(year){
  const y=yearData(year), p={};
  if(!y) return p;
  y.stimuli.forEach(s=>s.questions.forEach(q=>(q.tags||[]).forEach(t=>p[t]=(p[t]||0)+1)));
  return p;
}
function chooseOldYear(){
  const unseen=[2019,2020,2021,2022].filter(y=>!getInitial(y));
  if(!unseen.length) return null;
  const weak=computeWeakness().slice(0,4);
  if(!weak.length) return unseen[0];
  let best=unseen[0], bestScore=-1;
  for(const y of unseen){
    const profile=yearTagProfile(y);
    const score=weak.reduce((s,w)=>s+(profile[w.tag]||0)*w.weight,0);
    if(score>bestScore){bestScore=score;best=y;}
  }
  return best;
}
function remediationComplete(year){
  return targetRemediationComplete(year);
}
function topWeakTagsFromAttempt(year){
  const att=getInitial(year),map=qMap(year),c={};
  if(!att) return [];
  for(const qid of att.wrongQids||[]){
    const q=map[qid]?.q;if(!q || !gradeInTarget(qGrade(q)))continue;
    const weight=qGrade(q)==="A"?2:qGrade(q)==="B"?1.4:1;
    (q.tags||[]).forEach(t=>c[t]=(c[t]||0)+weight);
  }
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
}
function relevantProvisionalReady(year){
  const tags=topWeakTagsFromAttempt(year).slice(0,2);
  return tags.every(t=>["provisional","mastered"].includes(state.progress.mastery?.[t]?.status));
}
function dueRetention(){
  const rows=Object.entries(state.progress.mastery||{})
    .filter(([,r])=>{
      if(r.status!=="provisional" || !r.due || r.due>todayISO()) return false;
      const grades=r.sourceDifficulties || r.sourceProfile?.difficulties || [];
      return !grades.length || grades.some(g=>gradeInTarget(g));
    })
    .map(([tag,r])=>({tag,...r}))
    .sort((a,b)=>String(a.due).localeCompare(String(b.due)));
  return rows[0] || null;
}

function computeNextTask(){
  if(!state.pack) return {type:"load-pack", title:"Private Packを読み込む", meta:"2019–2026年度の過去問データが必要です。"};

  const activeTask=activeSessionTask();
  if(activeTask) return activeTask;

  // Finish the currently active correction cycle before inserting spaced review.
  // The retention window is 2–4 days, so a short delay is acceptable and avoids breaking
  // the "past exam → correction → drill" learning sequence.
  if(state.progress.pending?.type==="drill-sequence"){
    const p=state.progress.pending;
    if(p.stage==="script"){
      return {type:"resume-script",year:p.year,groupIndex:p.groupIndex,title:`${p.year}年度のスクリプト練習を続ける`,meta:"本番相当類題で基準未達だったため、根拠区間の聞き直しから再開します。"};
    }
    if(p.stage==="transfer"){
      return {type:"resume-transfer",year:p.year,title:`${p.year}年度の本番相当類題を続ける`,meta:"弱点ミニ練習の次に、本番に近い情報量で転移を確認します。"};
    }
    const tag=p.tags?.[p.index];
    if(tag){
      return {type:"resume-drill",tag,year:p.year,title:`${SKILL_LABELS[tag]||tag} の弱点ミニ練習を続ける`,meta:"技能を短い問題で確認した後、必要なら本番相当類題へ進みます。"};
    }
  }
  if(state.progress.pending?.type==="standalone-transfer"){
    const p=state.progress.pending;
    return {type:"resume-transfer",title:`${SKILL_LABELS[p.tag]||p.tag} の本番相当類題を続ける`,meta:"短いミニ練習だけで終わらせず、本番に近い情報量で再確認します。"};
  }
  if(state.progress.pending?.type==="retention-recovery"){
    const p=state.progress.pending;
    const tag=p.tags?.[p.index];
    return {type:"resume-drill",tag,title:`${SKILL_LABELS[tag]||tag} の弱点ミニ練習をやり直す`,meta:"本番相当の定着確認で失点したため、関連技能を短い問題から再確認します。"};
  }
  for(const y of REQUIRED_YEARS){
    const a=getInitial(y),remaining=remainingTargetWrongQids(y);
    if(a && remaining.length){
      return {
        type:"resume-remediation",year:y,
        title:`${y}年度の${targetGoalLabel()}必須問題を補強`,
        meta:`現在の目標では A${currentTargetScore()>=70?"・B":""}${currentTargetScore()>=75?"・C":""}問題を必須補強にします。残り ${remaining.length}問。`
      };
    }
  }

  const due=dueRetention();
  if(due){
    if(["short","long"].includes(due.retentionMode)){
      return {type:"retention-transfer",tag:due.tag,tags:due.linkedTags||[due.tag],mode:due.retentionMode,title:`${SKILL_LABELS[due.tag]||due.tag} の本番相当定着確認`,meta:due.retentionMode==="long"?"160〜260語程度の未見長文セットで確認します。":"過去問に近い会話量の未見問題で確認します。"};
    }
    return {type:"retention", tag:due.tag, title:`${SKILL_LABELS[due.tag]||due.tag} の定着確認`, meta:"2〜4日後の未見ミニ類題。1回で取れるか確認します。"};
  }

  if(!getInitial(2023)) return {type:"exam",year:2023,title:"2023年度で初回診断",meta:"10問・20点。合成音声で1回だけ聞きます。"};

  // Before 2024, use 1 or at most 2 old years.
  if(!getInitial(2024)){
    const oldDone=[2019,2020,2021,2022].filter(y=>getInitial(y));
    if(oldDone.length===0){
      const y=chooseOldYear(); return {type:"exam",year:y,title:`${y}年度で弱点確認`,meta:"2023の弱点に合う未見年度を自動選択しました。"};
    }
    const lastOld=oldDone.sort((a,b)=>new Date(getInitial(b).date)-new Date(getInitial(a).date))[0];
    const a=getInitial(lastOld);
    const pass = STUDY_PLAN.isStableAttempt(a,relevantProvisionalReady(lastOld));
    if(pass || oldDone.length>=2){
      return {type:"exam",year:2024,title:"2024年度で中間チェック",meta:"直近寄りの形式で、補強が通用するか確認します。"};
    }
    const y=chooseOldYear();
    return {type:"exam",year:y,title:`${y}年度でもう1回補強`,meta:`リスニング安定条件（14/20・A問題失点1以下）と、${targetGoalLabel()}で必要な主要弱点の仮合格を確認するため、2024の前にもう1年度だけ実施します。`};
  }

  const remainingOld=[2019,2020,2021,2022].filter(y=>!getInitial(y));
  if(remainingOld.length){
    const y=chooseOldYear(); return {type:"exam",year:y,title:`${y}年度で技能完成`,meta:"2019〜2022の残りを弱点に合わせて回します。"};
  }

  if(!getInitial(2025)) return {type:"exam",year:2025,title:"2025年度 直近型模試①",meta:"未見のまま本番形式で実施します。"};
  if(!getInitial(2026)) return {type:"exam",year:2026,title:"2026年度 最終模試",meta:"最後まで未見で残した直近年度です。"};

  return {type:"free",title:"全年度の初回診断完了",meta:"定着確認が来たら優先し、必要なら弱点別類題を続けます。"};
}


function masteryAllowedForTarget(row){
  const grades=row?.sourceDifficulties || row?.sourceProfile?.difficulties || [];
  return !grades.length || grades.some(g=>gradeInTarget(g));
}
function estimateRemainingForTarget(){
  const remainingYears=REQUIRED_YEARS.filter(y=>!getInitial(y)).length;
  const activeRemediation=REQUIRED_YEARS.filter(y=>getInitial(y)&&remainingTargetWrongQids(y).length>0).length;
  const mastery=Object.values(state.progress.mastery||{}).filter(masteryAllowedForTarget);
  const provisional=mastery.filter(r=>r?.status==="provisional");
  const needsPractice=mastery.filter(r=>r?.status==="needs-practice").length;
  const projectedRemediation=remainingYears;
  const projectedRetention=remainingYears?Math.min(5,Math.max(2,Math.ceil(remainingYears*.6))):0;
  const steps=remainingYears+activeRemediation+projectedRemediation+provisional.length+needsPractice*2+projectedRetention;
  if(!steps)return {min:0,max:0,remainingYears,activeRemediation};
  return {min:Math.max(1,Math.ceil(Math.max(1,steps-2)/DAILY_STEP_GOAL)),max:Math.ceil((steps+2)/DAILY_STEP_GOAL),remainingYears,activeRemediation};
}
function renderDashboard(){
  renderTargetStrategy();
  const task=computeNextTask();
  const estimate=estimateRemainingForTarget();
  const dailyCount=dailyCompletedIds().length;
  const achieved=dailyCount>=DAILY_STEP_GOAL;
  els.dailyProgress.classList.toggle("achieved",achieved);
  els.dailyProgress.innerHTML=achieved
    ? `<strong>今日の目標を達成しました：${dailyCount}ステップ完了（目標${DAILY_STEP_GOAL}）</strong><p>ここで終了して大丈夫です。余力があれば次の学習へ進めます。</p>`
    : `<strong>今日の学習：${dailyCount} / ${DAILY_STEP_GOAL} ステップ完了</strong><p>あと${DAILY_STEP_GOAL-dailyCount}ステップで今日の目標達成です。</p>`;
  els.todayTask.innerHTML=`
    <div class="task-title">${esc(task.title)}</div>
    <div class="task-meta">${esc(task.meta||"")}</div>
    <div class="task-badges">
      ${task.year?`<span class="pill">${task.year}年度</span>`:""}
      ${task.tag?`<span class="pill">${esc(SKILL_LABELS[task.tag]||task.tag)}</span>`:""}
      ${task.type==="resume-active-session"?'<span class="pill">途中保存から再開</span>':""}
    </div>`;
  els.todayStartBtn.disabled = task.type==="free";
  els.todayStartBtn.textContent = task.type==="resume-active-session" ? "続きから次へ進む"
    : achieved ? "さらに1ステップ進める"
    : dailyCount>0 ? "今日の学習を続ける" : "今日の学習を始める";
  els.todayStartBtn.dataset.task = JSON.stringify(task);
  els.remainingDays.textContent=estimate.max===0
    ? "予定していた初回診断と補強が完了しました。"
    : `完了までの目安：あと約${estimate.min}〜${estimate.max}日（毎日3ステップ進めた場合）`;

  if(state.pack){
    const auto = state.packSource==="bundled";
    els.dataStatus.innerHTML=auto
      ? `<p><strong>2019–2026 過去問データ 自動読込済み</strong></p><p class="small">8年度 × 10問 = 80問。過去問データは自動で読み込まれます。</p>`
      : `<p><strong>2019–2026 過去問データ 読込済み</strong></p><p class="small">8年度 × 10問 = 80問。初回得点は20点満点で保存します。</p>`;
    if(APP_CONFIG.hidePackControlsWhenBundled && auto){
      els.packInputLabel?.classList.add("hidden");
      els.forgetPackBtn?.classList.add("hidden");
    }else{
      els.packInputLabel?.classList.remove("hidden");
      els.forgetPackBtn?.classList.remove("hidden");
    }
  }else{
    els.dataStatus.innerHTML=`<p><strong>過去問データ未読込</strong></p><p class="small">公開版には公式過去問本文を同梱していません。必要な場合はPrivate Packをローカルから読み込んでください。</p>`;
    els.packInputLabel?.classList.remove("hidden");
    els.forgetPackBtn?.classList.remove("hidden");
  }

  renderRoadmap();
  renderWeakness();
  renderRetentionPanel();
  renderStorageStatus();
  renderDashboardHistorySummary();
}
function strategicLabel(score){
  return STUDY_PLAN.strategicLabel(score);
}
function renderRoadmap(){
  const current=computeNextTask().year;
  els.roadmap.innerHTML=REQUIRED_YEARS.map(y=>{
    const a=getInitial(y);
    const cls=a?"done":current===y?"current":"locked";
    const remain=a?remainingTargetWrongQids(y).length:0;
    const hint=a?"10問を復習":"未見を維持";
    const targetStatus=a
      ? (remain?`${targetGoalLabel()} 必須補強 残り${remain}問`:`${targetGoalLabel()} 必須補強完了`)
      : "未見を維持";
    return `<button type="button" class="year-card ${cls}" data-year="${y}" aria-label="${y}年度 ${a?"復習を開く":"未実施"}">
      <div class="year-top"><strong>${y}</strong><span class="status-dot">${a?"初回済":current===y?"次":"未実施"}</span></div>
      ${a?`<div class="year-score">${a.score}/20</div><div class="small">${strategicLabel(a.score)} · A失点 ${a.aMisses}</div><div class="small">${esc(targetStatus)}</div>`:`<div class="small">未見を維持</div>`}
      <div class="year-review-hint">${hint} →</div>
    </button>`;
  }).join("");
  els.roadmap.querySelectorAll(".year-card").forEach(btn=>btn.addEventListener("click",()=>{
    openYearReview(Number(btn.dataset.year));
  }));
}
function renderWeakness(){
  const w=computeWeakness();
  if(!w.length){
    const hasAttempts=allInitialYears().length>0;
    els.weaknessPanel.innerHTML=hasAttempts
      ? `<p class="small">${esc(targetGoalLabel())}で必須補強するA/B/C範囲には、現在目立つ失点技能がありません。目標を上げると対象範囲も広がります。</p>`
      : '<p class="small">まだ診断データがありません。</p>';
    return;
  }
  const causes=repeatedCauseInsights();
  const causeHtml=causes.length
    ? `<div class="cause-insight-box"><strong>反復しているミス原因</strong>${causes.slice(0,3).map(r=>{
        const priority=r.a>0?"A問題でも反復・最優先":r.b>0?"B問題で反復・重点":"C問題で反復";
        return `<div class="cause-insight-row"><span>${esc(CAUSE_LABELS[r.cause]||r.cause)}</span><strong>${r.total}問</strong><small>${priority}</small></div>`;
      }).join("")}<p class="small">現在の${esc(targetGoalLabel())}で対象になる問題だけを集計します。</p></div>`
    : "";
  els.weaknessPanel.innerHTML=`${causeHtml}<div class="skill-list">${w.slice(0,7).map(x=>{
    const m=state.progress.mastery?.[x.tag];
    const st=m?.status==="mastered"?"定着":m?.status==="provisional"?"仮合格":"要対策";
    const cls=m?.status==="mastered"?"mastered":m?.status==="provisional"?"provisional":"needs-action";
    return `<button type="button" class="skill-row skill-row-button" data-tag="${esc(x.tag)}">
      <div><div class="skill-name">${esc(SKILL_LABELS[x.tag]||x.tag)}</div><div class="skill-meta">${esc(targetGoalLabel())}対象の失点 ${x.miss}問 · ${x.years.join(", ")}</div></div>
      <strong class="${cls}">${st} →</strong>
    </button>`;
  }).join("")}</div>`;
  els.weaknessPanel.querySelectorAll(".skill-row-button").forEach(btn=>btn.addEventListener("click",()=>{
    openWeaknessReview(btn.dataset.tag);
  }));
}
function renderRetentionPanel(){
  const rows=Object.entries(state.progress.mastery||{}).filter(([,r])=>["provisional","mastered"].includes(r.status));
  if(!rows.length){ els.retentionPanel.innerHTML='<p class="small">類題を仮合格すると、2〜4日後の定着確認がここに出ます。</p>'; return; }
  els.retentionPanel.innerHTML='<div class="retention-list">'+rows.map(([tag,r])=>{
    const due=r.status==="mastered"?"定着済":`期限 ${r.due}`;
    return `<div class="skill-row"><span>${esc(SKILL_LABELS[tag]||tag)}</span><strong class="${r.status==="mastered"?"mastered":"provisional"}">${due}</strong></div>`;
  }).join("")+'</div>';
}

function renderChoiceGroup(container, q, selected, onSelect, reveal=false){
  if(!container || !q || !Array.isArray(q.choices) || q.choices.length<2){
    if(container) container.innerHTML='<div class="feedback ng"><strong>選択肢を表示できませんでした。</strong></div>';
    return false;
  }
  container.innerHTML=`<div class="choices">${q.choices.map((c,i)=>{
    let cls="choice"+(selected===i?" selected":"");
    if(reveal){ if(i===q.correct) cls+=" correct"; else if(selected===i && i!==q.correct) cls+=" incorrect"; }
    return `<button type="button" class="${cls}" data-i="${i}"><span class="kana">${KANA[i]??String(i+1)}</span><span>${esc(c)}</span></button>`;
  }).join("")}</div>`;
  const buttons=container.querySelectorAll(".choice");
  buttons.forEach(b=>b.addEventListener("click",()=>onSelect(Number(b.dataset.i))));
  return buttons.length===q.choices.length;
}

function allAnswered(questions,getAnswer){
  return Array.isArray(questions) && questions.length>0 && questions.every((q,i)=>getAnswer(q,i)!=null);
}
function listeningReady({choicesOk=true,played=false,answered=false,speaking=state.speaking}={}){
  return !!choicesOk && !!played && !!answered && !speaking;
}


function transcriptRoleLabel(role){
  const key=String(role||"").toLowerCase();
  if(key==="man" || key==="male") return "Man";
  if(key==="woman" || key==="female") return "Woman";
  if(key==="boy") return "Boy";
  if(key==="girl") return "Girl";
  if(key==="narrator") return "Narrator";
  return role ? String(role) : "Speaker";
}

function transcriptHtml(turns){
  const rows=(turns||[]).map(turn=>{
    const role=transcriptRoleLabel(turn?.role);
    return `<div class="answer-transcript-line"><strong>${esc(role)}:</strong> ${esc(turn?.text||"")}</div>`;
  }).join("");
  return `<div class="answer-transcript">
    <div class="answer-transcript-title">Transcript</div>
    <div class="small">音声を確認しながら、聞き取れなかった箇所と正解の根拠をもう一度確認してください。</div>
    <div class="answer-transcript-body">${rows||'<span class="small">Transcriptを表示できません。</span>'}</div>
  </div>`;
}

async function replayOriginalAfterAnswer(stimulus,statusEl,buttonEl){
  if(state.speaking) return;
  if(buttonEl){
    buttonEl.disabled=true;
    buttonEl.textContent="再生中…";
  }
  if(statusEl) statusEl.textContent="復習音声を再生中…";
  try{
    await playStimulusQueued(stimulus,statusEl,1);
    if(statusEl) statusEl.textContent="復習音声の再生が終わりました";
  }catch(err){
    if(statusEl) statusEl.textContent=speechFailureMessage();
    toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
  }finally{
    if(buttonEl){
      buttonEl.disabled=false;
      buttonEl.textContent="もう一度音声を再生";
    }
  }
}


function lockChoiceButtons(container){
  if(!container) return;
  container.querySelectorAll(".choice").forEach(btn=>{btn.disabled=true;});
}


// ---------- Exam ----------
function startExam(year, retake=false){
  const y=yearData(year); if(!y){toast("年度データがありません。");return;}
  state.exam={year, retake, stimuli:y.stimuli, idx:0, answers:{}, played:{}, started:new Date().toISOString()};
  setActiveSession(examSessionSnapshot(),{save:true});
  showView("examView");
  renderExam();
  // Fresh-start invariant: the very first exam screen must already contain answer choices.
  if(!ensureExamAnswerUi()){
    if(els.examPlayBtn) els.examPlayBtn.disabled=true;
    if(els.examNextBtn) els.examNextBtn.disabled=true;
    if(els.examUiError){
      els.examUiError.classList.remove("hidden");
      els.examUiError.innerHTML='<strong>初回問題の選択肢を表示できませんでした。</strong><p>Build v22 が表示されていることを確認して再読み込みしてください.</p>';
    }
  }
}
function renderExamQuestions(){
  const e=state.exam,s=e?.stimuli?.[e.idx];
  if(!e || !s || !Array.isArray(s.questions) || !els.examQuestions) return false;
  els.examQuestions.innerHTML="";
  let rendered=0;
  s.questions.forEach((q,j)=>{
    if(!q || !Array.isArray(q.choices) || q.choices.length<2) return;
    const wrap=document.createElement("div");
    wrap.className="question-block exam-question-block";
    wrap.dataset.examQid=q.id;
    const shownStem=s.section===1
      ? `${s.questions.length>1?`Question ${j+1}`:"Question"}（質問文は音声で読み上げ）`
      : `${s.questions.length>1?`Question ${j+1}`:"Question"}: ${esc(q.text)}`;
    wrap.innerHTML=`<p class="question-text">${shownStem}</p><div class="cg"></div>`;
    els.examQuestions.appendChild(wrap);
    const ok=renderChoiceGroup(wrap.querySelector(".cg"),q,e.answers[q.id],i=>{
      e.answers[q.id]=i;
      setActiveSession(examSessionSnapshot(),{save:true});
      renderExam();
    });
    if(ok) rendered++;
  });
  return rendered===s.questions.length && rendered>0;
}
function ensureExamAnswerUi(){
  const e=state.exam,s=e?.stimuli?.[e.idx];
  if(!e || !s || !els.examQuestions) return false;
  const expected=s.questions?.length||0;
  const actual=els.examQuestions.querySelectorAll(".exam-question-block").length;
  const choiceCount=els.examQuestions.querySelectorAll(".choice").length;
  const expectedChoices=(s.questions||[]).reduce((n,q)=>n+(q.choices?.length||0),0);
  if(els.examTitle && !els.examTitle.textContent.trim()) els.examTitle.textContent=`${e.year}年度 リスニング`;
  if(els.examSectionLabel && !els.examSectionLabel.textContent.trim()) els.examSectionLabel.textContent=`大問${s.section} · ${s.kind==="short"?"短い会話":"長めの話"}`;
  if(els.examStimulusLabel && !els.examStimulusLabel.textContent.trim()) els.examStimulusLabel.textContent=`Number ${s.number}`;
  if(actual!==expected || choiceCount!==expectedChoices) return renderExamQuestions();
  return true;
}
function renderExam(){
  const e=state.exam,s=e?.stimuli?.[e.idx];
  if(!e || !s){
    toast("問題データを表示できません。ダッシュボードから再度開いてください。");
    return;
  }

  // Questions are the essential exam UI. Render them before any decorative
  // header/progress elements so a missing optional DOM node can never hide the choices.
  const questionsOk=renderExamQuestions();
  if(els.examUiError){
    els.examUiError.classList.toggle("hidden",questionsOk);
    els.examUiError.innerHTML=questionsOk?"":'<strong>回答選択肢を表示できませんでした。</strong><p>この状態では音声を開始しません。Build v22 が表示されているか確認し、ページを再読み込みしてください.</p>';
  }
  if(!questionsOk){
    if(els.examQuestions){
      els.examQuestions.innerHTML='<div class="feedback ng"><strong>選択肢を表示できませんでした。</strong><p>ページを再読み込みしてください。回答データは保存されています。</p></div>';
    }
    toast("回答選択肢の描画に失敗しました。");
  }

  if(els.examTitle) els.examTitle.textContent=`${e.year}年度 リスニング`;
  if(els.examProgressText){
    const totalQuestions=e.stimuli.reduce((n,item)=>n+(item.questions?.length||0),0);
    const firstQuestion=e.stimuli.slice(0,e.idx).reduce((n,item)=>n+(item.questions?.length||0),0)+1;
    const lastQuestion=firstQuestion+(s.questions?.length||1)-1;
    const questionRange=firstQuestion===lastQuestion?String(firstQuestion):`${firstQuestion}–${lastQuestion}`;
    els.examProgressText.textContent=`音声 ${e.idx+1}/${e.stimuli.length}・問題 ${questionRange}/${totalQuestions}`;
  }
  if(els.examProgressBar) els.examProgressBar.style.width=`${(e.idx+1)/e.stimuli.length*100}%`;
  if(els.examSectionLabel) els.examSectionLabel.textContent=`大問${s.section} · ${s.kind==="short"?"短い会話":"長めの話"}`;
  if(els.examStimulusLabel) els.examStimulusLabel.textContent=`Number ${s.number}`;
  if(els.examAudioStatus) els.examAudioStatus.textContent=state.speaking?"再生中…":(e.played[s.id]?"再生済み":"準備完了");
  if(els.examPlayBtn){
    els.examPlayBtn.disabled=!!e.played[s.id] || state.speaking;
    els.examPlayBtn.textContent=state.speaking?"再生中…":(e.played[s.id]?"再生済み":"音声を再生");
  }
  if(els.examNextBtn){
    const answered=allAnswered(s.questions,q=>e.answers[q.id]);
    els.examNextBtn.textContent=e.idx===e.stimuli.length-1?"採点する":"次へ";
    els.examNextBtn.disabled=!listeningReady({choicesOk:questionsOk,played:!!e.played[s.id],answered});
  }
}
async function playExam(){
  const e=state.exam,s=e?.stimuli?.[e.idx];
  if(!e || !s || e.played[s.id] || state.speaking) return;

  // Never start audio while the answer UI is missing. This protects against a mixed
  // old/new GitHub Pages asset cache and against accidental DOM regressions.
  if(!ensureExamAnswerUi()){
    toast("回答選択肢を表示できないため、音声再生を開始しませんでした。ページを再読み込みしてください。");
    return;
  }

  els.examPlayBtn.disabled=true;
  els.examAudioStatus.textContent="音声を準備中…";
  try{
    await playStimulusQueued(s,els.examAudioStatus,1);
    e.played[s.id]=true;
  }catch(err){
    e.played[s.id]=false;
    els.examAudioStatus.textContent=speechFailureMessage();
    toast("音声を開始できませんでした。ブラウザまたはOSの英語音声設定を確認してください。");
  }finally{
    setActiveSession(examSessionSnapshot(),{save:true});
    renderExam();
    if(!e.played[s.id]) els.examAudioStatus.textContent=speechFailureMessage();
  }
}
function examNext(){
  const e=state.exam,s=e.stimuli[e.idx];
  if(!e.played[s.id]){toast("先に音声を1回聞いてください。");return;}
  if(s.questions.some(q=>e.answers[q.id]==null)){toast("すべての設問に回答してください。");return;}
  if(e.idx<e.stimuli.length-1){
    e.idx++;
    setActiveSession(examSessionSnapshot(),{save:true});
    renderExam();return;
  }
  finishExam();
}
function finishExam(){
  const e=state.exam,map=qMap(e.year);
  let score=0,aMisses=0;const wrong=[];
  for(const [qid,item] of Object.entries(map)){
    const q=item.q,ans=e.answers[qid];
    if(ans===q.correct)score+=q.points;
    else{wrong.push(qid);if(qGrade(q)==="A")aMisses++;}
  }
  const targetedWrong=wrong.filter(qid=>gradeInTarget(qGrade(map[qid]?.q)));
  const record={
    date:new Date().toISOString(),score,aMisses,answers:e.answers,wrongQids:wrong,
    remediationComplete:wrong.length===0,completedRemediationQids:[],
    causes:{},rediagnosis:{},retakes:[]
  };
  state.progress.attempts[e.year] ||= {};
  const isFirstAttempt=!state.progress.attempts[e.year].initial;
  if(isFirstAttempt){
    state.progress.attempts[e.year].initial=record;
    state.progress.history.unshift({year:e.year,date:record.date,score,aMisses,type:"initial"});
  }else{
    state.progress.attempts[e.year].retakes ||= [];
    state.progress.attempts[e.year].retakes.push(record);
  }
  if(isFirstAttempt) markDailyStep(`exam-initial:${e.year}`);
  state.progress.activeSession=null;
  saveProgress();
  if(!e.retake){
    els.initialScore.textContent=String(score);
    els.initialScoreRing.style.setProperty("--angle",`${score/20*360}deg`);
    els.initialScoreMessage.textContent=`${strategicLabel(score)}。A問題失点 ${aMisses}問。${targetGoalLabel()}で必須補強 ${targetedWrong.length}問。初回得点は今後も上書きしません。`;
    els.startRediagnosisBtn.textContent=targetedWrong.length?`${targetGoalLabel()}の必須問題を再診断する`:"現在の目標では次へ進む";
    els.startRediagnosisBtn.dataset.noWrong=targetedWrong.length?"0":"1";
    showView("scoreOnlyView");
  }else{
    toast(`再受験 ${score}/20。初回得点は保持されています。`);
    showView("dashboardView");renderDashboard();
  }
}

// ---------- Rediagnosis ----------
function startRediagnosis(year){
  const att=getInitial(year);
  if(!att) return;
  const groups=buildTargetWrongGroups(year,{remainingOnly:true});
  if(!groups.length){
    toast(`${targetGoalLabel()}で必須補強する問題は残っていません。`);
    showView("dashboardView");renderDashboard();return;
  }
  state.rediagnosis={year,groups,idx:0,answers:{},played:{},revealed:false,targetScore:currentTargetScore()};
  setActiveSession(rediagnosisSessionSnapshot("rediagnosis"),{save:true});
  showView("rediagnosisView");renderRediagnosis();
}
function renderRediagnosisQuestions(){
  const r=state.rediagnosis,g=r?.groups?.[r.idx];
  if(!r || !g || !els.rediagnosisQuestions) return false;
  const s=g.stimulus,map=qMap(r.year);
  els.rediagnosisQuestions.innerHTML="";
  let rendered=0;
  g.qids.forEach((qid,j)=>{
    const item=map[qid],q=item?.q;
    if(!q || !Array.isArray(q.choices) || q.choices.length!==4) return;
    const wrap=document.createElement("div");
    wrap.className="question-block rediagnosis-question-block";
    wrap.dataset.rediagnosisQid=qid;
    const label=g.qids.length>1?`Question ${j+1}`:"Question";
    const shownStem=s.section===1
      ? `${label}（質問文は音声で読み上げ）`
      : `${label}: ${esc(q.text)}`;
    wrap.innerHTML=`<p class="question-text">${shownStem}</p><div class="cg"></div>`;
    els.rediagnosisQuestions.appendChild(wrap);
    const ok=renderChoiceGroup(wrap.querySelector(".cg"),q,r.answers[qid],i=>{
      r.answers[qid]=i;
      setActiveSession(rediagnosisSessionSnapshot("rediagnosis"),{save:true});
      renderRediagnosis();
    });
    if(ok) rendered++;
  });
  return rendered===g.qids.length && rendered>0;
}
function ensureRediagnosisAnswerUi(){
  const r=state.rediagnosis,g=r?.groups?.[r.idx];
  if(!r || !g || !els.rediagnosisQuestions) return false;
  const expected=g.qids.length;
  const actual=els.rediagnosisQuestions.querySelectorAll(".rediagnosis-question-block").length;
  const choices=els.rediagnosisQuestions.querySelectorAll(".choice").length;
  const expectedChoices=g.qids.length*4;
  if(actual!==expected || choices!==expectedChoices) return renderRediagnosisQuestions();
  return true;
}
function renderRediagnosis(){
  const r=state.rediagnosis,g=r?.groups?.[r.idx];
  if(!r || !g){
    toast("再診断データを表示できません。ダッシュボードから再度開いてください。");
    return;
  }
  const s=g.stimulus;

  const choicesOk=renderRediagnosisQuestions();
  if(els.rediagnosisUiError){
    els.rediagnosisUiError.classList.toggle("hidden",choicesOk);
    els.rediagnosisUiError.innerHTML=choicesOk?"":'<strong>回答選択肢を表示できませんでした。</strong><p>この状態では音声再生・回答確定を行いません。Build v22を確認して再読み込みしてください.</p>';
  }

  if(els.rediagnosisProgress) els.rediagnosisProgress.textContent=`${r.idx+1} / ${r.groups.length}`;
  if(els.rediagnosisBar) els.rediagnosisBar.style.width=`${(r.idx+1)/r.groups.length*100}%`;
  if(els.rediagnosisTitle) els.rediagnosisTitle.textContent=`${r.year}年度 大問${s.section} Number ${s.number}`;
  if(els.rediagnosisAudioStatus) els.rediagnosisAudioStatus.textContent=state.speaking?"再生中…":(r.played[s.id]?"再生済み":"正解はまだ非表示です");
  if(els.rediagnosisPlayBtn){
    els.rediagnosisPlayBtn.disabled=!choicesOk || !!r.played[s.id] || state.speaking;
    els.rediagnosisPlayBtn.textContent=state.speaking?"再生中…":(r.played[s.id]?"再生済み":"もう1回だけ聞く");
  }
  if(els.rediagnosisSubmitBtn){
    const answered=allAnswered(g.qids,qid=>r.answers[qid]);
    els.rediagnosisSubmitBtn.disabled=!listeningReady({choicesOk,played:!!r.played[s.id],answered});
  }
  if(els.rediagnosisResult){
    els.rediagnosisResult.classList.add("hidden");
    els.rediagnosisResult.innerHTML="";
  }
  if(!choicesOk) toast("回答選択肢の表示に失敗しました。");
}
async function playRediagnosis(){
  const r=state.rediagnosis,g=r?.groups?.[r.idx],s=g?.stimulus;
  if(!r || !g || !s || r.played[s.id] || state.speaking)return;

  // Defensive UI check: the four answer choices must already be visible before audio starts.
  // This does not reveal the correct answer and does not change any learning/progression logic.
  if(!ensureRediagnosisAnswerUi()){
    toast("回答選択肢を表示できないため、音声再生を開始しませんでした。");
    return;
  }

  const map=qMap(r.year);
  const focused={...s,questions:g.qids.map(qid=>map[qid]?.q).filter(Boolean)};
  if(focused.questions.length!==g.qids.length){
    toast("再診断の設問データを読み込めませんでした。");
    return;
  }

  els.rediagnosisPlayBtn.disabled=true;
  els.rediagnosisSubmitBtn.disabled=true;
  els.rediagnosisAudioStatus.textContent="音声を準備中…";
  try{
    await playStimulusQueued(focused,els.rediagnosisAudioStatus,1);
    r.played[s.id]=true;
  }catch(err){
    r.played[s.id]=false;
    els.rediagnosisAudioStatus.textContent=speechFailureMessage();
    toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
  }finally{
    setActiveSession(rediagnosisSessionSnapshot("rediagnosis"),{save:true});
    renderRediagnosis();
    if(!r.played[s.id]) els.rediagnosisAudioStatus.textContent=speechFailureMessage();
  }
}
function submitRediagnosis(){
  const r=state.rediagnosis,g=r.groups[r.idx],map=qMap(r.year),s=g.stimulus;
  if(!r.played[s.id]){toast("先に音声をもう1回聞いてください。");return;}
  if(g.qids.some(qid=>r.answers[qid]==null)){toast("すべての設問に回答してください。");return;}
  const att=getInitial(r.year);
  g.qids.forEach(qid=>{
    const correct=r.answers[qid]===map[qid].q.correct;
    const now=new Date().toISOString();
    att.rediagnosis[qid]={answer:r.answers[qid],correct,date:now};
    att.diagnostics ||= {};
    att.diagnostics[qid]={
      ...(att.diagnostics[qid]||{}),
      onePass:correct,
      persistentMiss:!correct,
      rediagnosedAt:now
    };
  });
  r.revealed=true;
  setActiveSession(rediagnosisSessionSnapshot("script-ready"),{save:false});
  saveProgress();
  // Reveal only now.
  els.rediagnosisResult.classList.remove("hidden");
  els.rediagnosisResult.innerHTML=`<div class="feedback"><strong>再診断結果</strong>${g.qids.map(qid=>{
    const q=map[qid].q,ans=r.answers[qid],ok=ans===q.correct;
    return `<p>${ok?"○":"×"} ${esc(q.text)}<br>正解: ${KANA[q.correct]} ${esc(q.choices[q.correct])}</p>`;
  }).join("")}<button id="toScriptNow" class="primary" type="button">スクリプト練習へ</button></div>`;
  lockChoiceButtons(els.rediagnosisQuestions);
  els.rediagnosisSubmitBtn.disabled=true;
  $("toScriptNow").addEventListener("click",()=>openScriptForCurrentGroup());
}
function openScriptForCurrentGroup(){
  const r=state.rediagnosis,g=r.groups[r.idx];
  state.script={
    year:r.year,
    groupIndex:g.sourceIndex ?? r.idx,
    groupId:g.id || g.stimulus.id,
    group:g,
    hidden:false,
    highlight:false,
    targetScore:r.targetScore || currentTargetScore()
  };
  setActiveSession(scriptSessionSnapshot(),{save:true});
  showView("scriptView");renderScript();
}
function scriptLines(stimulus){
  if(stimulus.kind==="short") return stimulus.turns.map(t=>({role:t.role,text:t.text}));
  return splitSentences(stimulus.passage).map(t=>({role:"narrator",text:t}));
}
function highlightUpdates(text){
  let out=esc(text);
  const sorted=[...UPDATE_WORDS].sort((a,b)=>b.length-a.length);
  for(const w of sorted){
    const re=new RegExp(`\\b${w.replace(" ","\\s+")}\\b`,"gi");
    out=out.replace(re,m=>`<mark class="update-word">${m}</mark>`);
  }
  return out;
}
function renderScript(){
  const s=state.script,g=s.group,stim=g.stimulus,map=qMap(s.year),lines=scriptLines(stim);
  els.scriptTitle.textContent=`${s.year}年度 大問${stim.section} Number ${stim.number}`;
  const tags=[...new Set(g.qids.flatMap(qid=>map[qid].q.tags||[]))];
  els.scriptSkillBadge.textContent=tags.map(t=>SKILL_LABELS[t]||t).join(" / ");
  els.answerReveal.innerHTML=g.qids.map(qid=>{
    const q=map[qid].q, init=getInitial(s.year).answers[qid], red=getInitial(s.year).rediagnosis?.[qid];
    return `<div class="answer-row"><strong>${esc(q.text)}</strong><br>
      初回: ${init==null?"未回答":KANA[init]} / 再診断: ${red?.answer==null?"未回答":KANA[red.answer]} / 正解: <strong>${KANA[q.correct]}</strong> ${esc(q.choices[q.correct])}</div>`;
  }).join("");
  els.hideScriptBtn.textContent=s.hidden?"スクリプトを表示":"スクリプトを隠す";
  els.highlightBtn.textContent=s.highlight?"強調を解除":"情報更新語を強調";
  els.scriptText.classList.toggle("script-hidden",s.hidden);
  els.scriptText.innerHTML=lines.map((ln,i)=>`<div class="script-line">
    <div class="script-role">${esc(ln.role)}</div>
    <div class="script-content">${s.highlight?highlightUpdates(ln.text):esc(ln.text)}</div>
    <div class="line-actions"><button class="tiny one" data-i="${i}">▶</button><button class="tiny five" data-i="${i}">×5</button></div>
  </div>`).join("") + `<div class="script-line"><div class="script-role">Question</div><div class="script-content">${g.qids.map(qid=>esc(map[qid].q.text)).join("<br>")}</div><div></div></div>`;
  els.scriptText.querySelectorAll(".one").forEach(b=>b.addEventListener("click",async()=>{const ln=lines[Number(b.dataset.i)];await speak(ln.text,ln.role,Number(els.practiceSpeed.value));}));
  els.scriptText.querySelectorAll(".five").forEach(b=>b.addEventListener("click",async()=>{const ln=lines[Number(b.dataset.i)];for(let k=0;k<5;k++){await speak(ln.text,ln.role,Number(els.practiceSpeed.value));await sleep(300);}}));

  const att=getInitial(s.year);
  const missingRequired=groupCauseRecords(s.year,g).filter(r=>r.persistentMiss && !r.cause);
  els.startDrillBtn.textContent=missingRequired.length
    ? "ミス原因を選んで → オリジナル類題へ"
    : "スクリプト確認完了 → オリジナル類題へ";
  els.causePanel.innerHTML=g.qids.map(qid=>{
    const selected=selectedCause(att,qid);
    const diag=att.diagnostics?.[qid]||{};
    const required=!!diag.persistentMiss;
    const status=diag.onePass
      ? `<span class="cause-status one-pass">初回×→再診断○：ONE-PASS不安定</span>`
      : `<span class="cause-status persistent">初回×→再診断×：原因選択が必要</span>`;
    const recommendation=selected
      ? `<div class="cause-recommendation"><strong>この原因なら：</strong>${esc(causeRecommendation(selected,map[qid].q.tags||[]))}</div>`
      : "";
    return `<div class="cause-group" data-qid="${qid}">
      <div class="cause-head"><strong>${esc(map[qid].q.text)}</strong>${status}</div>
      <p class="small">${required?"次へ進む前に1つ選んでください。分からなければ「自分では原因が分からない」で構いません。":"原因入力は任意です。必要なら後から変更できます。"}</p>
      <div class="cause-buttons">${Object.entries(CAUSE_LABELS).map(([c,l])=>`<button class="cause-btn ${selected===c?"selected":""}" data-qid="${qid}" data-cause="${c}" type="button" title="${esc(CAUSE_HELP[c]||"")}">${esc(l)}</button>`).join("")}</div>
      ${selected?`<p class="cause-help small">${esc(CAUSE_HELP[selected]||"")}</p>`:""}
      ${recommendation}
    </div>`;
  }).join("");
  els.causePanel.querySelectorAll(".cause-btn").forEach(b=>b.addEventListener("click",()=>{
    const qid=b.dataset.qid,c=b.dataset.cause;
    att.causes ||= {};
    const current=selectedCause(att,qid);
    // Single-select. Tapping the same optional cause clears it; persistent misses may still clear,
    // but progression will then ask for a choice or UNKNOWN.
    att.causes[qid]=current===c?[]:[c];
    att.diagnostics ||= {};
    att.diagnostics[qid]={...(att.diagnostics[qid]||{}),causeUpdatedAt:new Date().toISOString()};
    if(c==="UPDATE") state.script.highlight=true;
    if(c==="HEAR") els.practiceSpeed.value="0.85";
    saveProgress(); renderScript();
  }));
}
async function fullScriptReplay(){
  const sp=state.script,stim=sp.group.stimulus;
  if(state.speaking) return;
  try{
    await playStimulusQueued(stim,null,Number(els.practiceSpeed.value));
  }catch(err){
    toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
  }
}
async function shadowCurrent(){
  const lines=scriptLines(state.script.group.stimulus);
  toast("各文の後に2秒空けます。声に出して追ってください。");
  for(const ln of lines){ await speak(ln.text,ln.role,Number(els.practiceSpeed.value)); await sleep(2000); }
}

function selectedCause(att,qid){
  const raw=att?.causes?.[qid];
  if(Array.isArray(raw)) return raw[0]||null;
  return typeof raw==="string" ? raw : null;
}
function groupCauseRecords(year,group){
  const att=getInitial(year),map=qMap(year);
  return (group?.qids||[]).map(qid=>({
    qid,
    cause:selectedCause(att,qid),
    redCorrect:!!att?.rediagnosis?.[qid]?.correct,
    onePass:!!att?.diagnostics?.[qid]?.onePass,
    persistentMiss:!!att?.diagnostics?.[qid]?.persistentMiss,
    tags:map[qid]?.q?.tags||[],
    difficulty:map[qid]?.q?.difficulty||"B"
  }));
}
function causeRecommendation(cause,tags=[]){
  const primary=tags[0]||"";
  const map={
    HEAR:"根拠文を0.85×→1.00×→1.05×で聞き、聞けない1文は×5反復します。",
    VOCAB:"スクリプトで意味が止まった語句・熟語を確認してから、同じ区間を通常速度で聞き直します。",
    MEANING:"1文ずつ意味を取り、主語・動作・否定・比較を確認してから全文へ戻ります。",
    UPDATE:"情報更新語を強調し、『前の情報→変更後の最終情報』を1行で整理します。",
    CALC:"数字だけを短くメモし、聞き取りと計算を分離してからTIME/MONEY型の類題へ進みます。",
    QUESTION:"再生前に『何を答える問題か』を日本語で一言確認してから聞きます。",
    MEMO:"人物・場所・数字・候補だけを最小限メモし、全文を書き取らない練習をします。",
    CARELESS:"類題数を増やすより、選択肢を押す前に設問条件と最終情報を1回照合します。",
    UNKNOWN:"原因を決め打ちせず、今回のスクリプトと次の未見類題の結果から見直します。"
  };
  return map[cause] || (primary?`${SKILL_LABELS[primary]||primary}の根拠区間を聞き直します。`:"根拠区間を聞き直します。");
}
function causeAdjustedDrillTags(baseTags,records){
  const tags=[...baseTags];
  const causes=new Set(records.map(r=>r.cause).filter(Boolean));
  // Causes refine Level 1 content, but do not decide whether Level 2/3 is required.
  if(causes.has("UPDATE") && !tags.includes("CHANGE")) tags.unshift("CHANGE");
  if(causes.has("CALC")){
    const numeric=records.flatMap(r=>r.tags).find(t=>["TIME","MONEY"].includes(t));
    if(numeric && !tags.includes(numeric)) tags.unshift(numeric);
  }
  return [...new Set(tags)].slice(0,2);
}
function repeatedCauseInsights(){
  const rows={},seenStimulus=new Set();
  for(const year of allInitialYears()){
    const att=getInitial(year),map=qMap(year);
    for(const qid of att.wrongQids||[]){
      const cause=selectedCause(att,qid);
      if(!cause || cause==="UNKNOWN") continue;
      const item=map[qid],q=item?.q;
      if(!q || !gradeInTarget(qGrade(q))) continue;
      const stimulusKey=`${cause}:${year}:${item.stimulus.id}`;
      if(seenStimulus.has(stimulusKey)) continue;
      seenStimulus.add(stimulusKey);
      const r=rows[cause] ||= {cause,total:0,a:0,b:0,c:0,weighted:0,years:new Set()};
      r.total++;r.years.add(year);
      const d=qGrade(q);
      if(d==="A"){r.a++;r.weighted+=3;}
      else if(d==="B"){r.b++;r.weighted+=2;}
      else {r.c++;r.weighted+=1;}
    }
  }
  return Object.values(rows)
    .filter(r=>r.total>=2)
    .sort((a,b)=>b.weighted-a.weighted||b.total-a.total)
    .map(r=>({...r,years:[...r.years]}));
}

function primaryDrillTags(){
  const sp=state.script,map=qMap(sp.year),tags=[];
  for(const qid of sp.group.qids){
    const qtags=map[qid].q.tags||[];
    qtags.forEach(t=>{ if(!tags.includes(t)) tags.push(t); });
  }
  const records=groupCauseRecords(sp.year,sp.group);
  return causeAdjustedDrillTags(tags.slice(0,2),records);
}
function startDrillsFromScript(){
  const att=getInitial(state.script.year);
  const records=groupCauseRecords(state.script.year,state.script.group);
  const missing=records.filter(r=>r.persistentMiss && !r.cause);
  if(missing.length){
    toast("再診断でも間違えた問題は、ミス原因を1つ選んでください。分からなければ「自分では原因が分からない」を選んで進めます。");
    els.causePanel.scrollIntoView({behavior:"smooth",block:"center"});
    return;
  }
  const existing=state.progress.pending;
  const sameGroup=existing?.type==="drill-sequence" && existing.year===state.script.year &&
    (existing.groupId?existing.groupId===state.script.groupId:existing.groupIndex===state.script.groupIndex);
  const tags=sameGroup?existing.tags:primaryDrillTags();
  const index=sameGroup?existing.index:0;
  const sourceDifficulties=[...new Set(state.script.group.qids.map(qid=>qGrade(qMap(state.script.year)[qid]?.q)))];
  state.progress.pending={
    type:"drill-sequence",stage:"drill",
    year:state.script.year,
    groupIndex:state.script.groupIndex,
    groupId:state.script.groupId,
    groupQids:[...state.script.group.qids],
    targetScore:state.script.targetScore || currentTargetScore(),
    sourceDifficulties,
    tags,index,
    causeSnapshot:records.map(r=>({qid:r.qid,cause:r.cause,onePass:r.onePass,persistentMiss:r.persistentMiss}))
  };
  state.progress.activeSession=null;
  saveProgress();startDrill(tags[index]);
}


function wordCountText(text){
  return (String(text||"").match(/[A-Za-z0-9']+/g)||[]).length;
}
function lexicalIndex(text){
  const words=(String(text||"").toLowerCase().match(/[a-z']+/g)||[]);
  if(!words.length) return 0;
  const avg=words.reduce((n,w)=>n+w.length,0)/words.length;
  const longRatio=words.filter(w=>w.length>=8).length/words.length;
  return avg + longRatio*3;
}
function countUpdateSignals(text){
  const s=` ${String(text||"").toLowerCase()} `;
  const signals=[" but "," however "," actually "," instead "," originally "," at first "," after all "," still "," then "," wait "," changed "," change "];
  return signals.reduce((n,x)=>n+(s.split(x).length-1),0);
}
function trapTypesFromTags(tags){
  const set=new Set();
  (tags||[]).forEach(t=>{
    if(t==="CHANGE") set.add("final-update");
    if(t==="TIME"||t==="MONEY") set.add("calculation-or-numeric");
    if(t==="NOT") set.add("negative-reversal");
    if(t==="TRUEFALSE"||t==="DETAIL") set.add("content-match");
    if(t==="MAIN"||t==="PURPOSE") set.add("global-purpose");
    if(t==="NEXT") set.add("natural-response");
    if(t==="PLACE"||t==="REASON") set.add("target-detail");
  });
  return [...set];
}
function approximateMentionedDecoys(q,text){
  const hay=String(text||"").toLowerCase();
  let count=0;
  (q.choices||[]).forEach((choice,i)=>{
    if(i===q.correct) return;
    const tokens=(String(choice).toLowerCase().match(/[a-z0-9']+/g)||[])
      .filter(w=>w.length>=3 && !["the","and","with","from","will","that","this","for"].includes(w));
    if(!tokens.length) return;
    const hits=tokens.filter(w=>hay.includes(w)).length;
    if(hits>=Math.min(2,tokens.length)) count++;
  });
  return count;
}
function sourceProfileForPending(p){
  if(!p || p.type!=="drill-sequence") return null;
  const all=fullWrongGroups(p.year);
  const g=(p.groupId && all.find(x=>x.id===p.groupId)) || all[p.groupIndex];
  if(!g) return null;
  const s=g.stimulus,map=qMap(p.year);
  const sourceQids=Array.isArray(p.groupQids)&&p.groupQids.length?p.groupQids:g.qids;
  const qs=sourceQids.map(qid=>map[qid]?.q).filter(Boolean);
  const tags=[...new Set(qs.flatMap(q=>q.tags||[]))];
  const difficulties=[...new Set(qs.map(q=>qGrade(q)))];
  const stimulusText=s.kind==="short"
    ? (s.turns||[]).map(t=>t.text).join(" ")
    : String(s.passage||"");
  const words=wordCountText(stimulusText);
  const decoys=qs.reduce((n,q)=>n+approximateMentionedDecoys(q,stimulusText),0);
  return {
    section:s.section,
    kind:s.kind,
    wordCount:words,
    turnCount:(s.turns||[]).length,
    tags,
    difficulties,
    targetScore:p.targetScore || currentTargetScore(),
    updateCount:countUpdateSignals(stimulusText),
    decoyCount:decoys,
    calculation:tags.some(t=>["TIME","MONEY"].includes(t)),
    trapTypes:trapTypesFromTags(tags),
    lexicalIndex:lexicalIndex(stimulusText),
    questionTypes:[...tags],
    hasB:difficulties.includes("B"),
    hasC:difficulties.includes("C")
  };
}
function transferModeForPending(p){
  const profile=sourceProfileForPending(p);
  if(!profile) return "mini";
  if(profile.section===2) return "long";
  if(profile.hasB && profile.tags.some(t=>["CHANGE","TIME","MONEY"].includes(t))) return "short";
  return "mini";
}
function transferBank(mode,retentionOnly=false){
  return (window.LISTENING_TRANSFER_BANK||[]).filter(x=>x.kind===mode && !!x.retentionOnly===!!retentionOnly);
}
function transferMatchScore(item,tags,profile){
  const itemTags=item.tags||[];
  const overlap=itemTags.filter(t=>tags.includes(t)).length;
  let score=overlap*120;
  if(!profile) return score;

  score-=Math.abs(Number(item.wordCount||0)-Number(profile.wordCount||0))*0.35;
  if(item.kind==="short") score-=Math.abs(Number(item.turnCount||0)-Number(profile.turnCount||0))*4;

  const itemUpdates=Number(item.updates ?? countUpdateSignals(
    item.kind==="short"?(item.turns||[]).map(t=>t.text).join(" "):item.passage||""
  ));
  score-=Math.abs(itemUpdates-Number(profile.updateCount||0))*7;

  score-=Math.abs(Number(item.decoys||0)-Number(profile.decoyCount||0))*3;

  const itemCalc=!!item.calculation || itemTags.some(t=>["TIME","MONEY"].includes(t));
  if(itemCalc===!!profile.calculation) score+=18;
  else score-=18;

  const itemTraps=trapTypesFromTags(itemTags);
  const trapOverlap=itemTraps.filter(t=>(profile.trapTypes||[]).includes(t)).length;
  score+=trapOverlap*12;

  const itemText=item.kind==="short"?(item.turns||[]).map(t=>t.text).join(" "):item.passage||"";
  score-=Math.abs(lexicalIndex(itemText)-Number(profile.lexicalIndex||0))*4;

  return score;
}
function chooseTransferItems(mode,tags,{retentionOnly=false,count=1,profile=null,preferredIds=null}={}){
  const all=transferBank(mode,retentionOnly);
  if(Array.isArray(preferredIds) && preferredIds.length){
    const restored=preferredIds.map(id=>all.find(x=>x.id===id)).filter(Boolean);
    if(restored.length) return restored;
  }

  state.progress.transferSeen ||= {};
  const key=`${mode}:${retentionOnly?"ret":"imm"}`;
  state.progress.transferSeen[key] ||= [];
  const seen=new Set(state.progress.transferSeen[key]);
  let pool=all.filter(x=>!seen.has(x.id));
  if(pool.length<count) pool=[...all];

  const targetTags=[...new Set(tags||[])];
  const selected=[];
  const remaining=new Set(targetTags);

  // For short B transfer with combined tags (e.g. TIME + CHANGE), cover distinct
  // target skills before choosing a second item of the same type.
  while(selected.length<count && pool.length){
    pool.sort((a,b)=>{
      const aNew=(a.tags||[]).filter(t=>remaining.has(t)).length;
      const bNew=(b.tags||[]).filter(t=>remaining.has(t)).length;
      if(aNew!==bNew) return bNew-aNew;
      return transferMatchScore(b,targetTags,profile)-transferMatchScore(a,targetTags,profile);
    });
    const best=pool.shift();
    selected.push(best);
    (best.tags||[]).forEach(t=>remaining.delete(t));
  }

  selected.forEach(x=>seen.add(x.id));
  state.progress.transferSeen[key]=[...seen];
  saveProgress();
  return selected;
}
function transferItemStimulus(item,number=1){
  return item.kind==="short"
    ? {number,kind:"short",turns:item.turns,questions:item.questions}
    : {number,kind:"long",passage:item.passage,questions:item.questions};
}
function finalizePendingMiniAsProvisional(mode="mini"){
  const p=state.progress.pending;
  if(!p || p.type!=="drill-sequence") return;
  const profile=sourceProfileForPending(p);
  p.tags.forEach(tag=>{
    const prev=state.progress.mastery[tag]||{};
    state.progress.mastery[tag]={...prev,status:"provisional",due:addDaysISO(3),retentionMode:mode,sourceProfile:profile,lastScore:prev.lastScore||"mini cleared",updated:new Date().toISOString()};
  });
  saveProgress();
}
function startTransfer(mode,tags,{context="remediation",retentionOnly=false,sourceProfile=null,preferredIds=null}={}){
  const count=mode==="short" && !retentionOnly ? 2 : 1;
  const items=chooseTransferItems(mode,tags,{retentionOnly,count,profile:sourceProfile,preferredIds});
  if(!items.length){
    toast("本番相当類題データがありません。");
    if(context==="remediation"){
      finalizePendingMiniAsProvisional("mini");
      completeCurrentRemediationGroup();
    }else{
      showView("dashboardView");renderDashboard();
    }
    return;
  }
  if(context==="remediation" && state.progress.pending?.type==="drill-sequence"){
    state.progress.pending.transferItemIds=items.map(x=>x.id);
    saveProgress();
  }
  if(context==="standalone" && state.progress.pending?.type==="standalone-transfer"){
    state.progress.pending.transferItemIds=items.map(x=>x.id);
    saveProgress();
  }
  state.transfer={
    mode,tags,context,retentionOnly,sourceProfile,
    items,idx:0,answers:{},played:{},correct:0,totalQuestions:items.reduce((n,x)=>n+x.questions.length,0)
  };
  setActiveSession(transferSessionSnapshot("transfer"),{save:true});
  showView("transferView");
  renderTransfer();
  if(!ensureTransferAnswerUi()){
    if(els.transferPlayBtn) els.transferPlayBtn.disabled=true;
    if(els.transferSubmitBtn) els.transferSubmitBtn.disabled=true;
  }
}
function renderTransferQuestions(){
  const t=state.transfer,it=t?.items?.[t.idx];
  if(!t || !it || !els.transferQuestions || !Array.isArray(it.questions) || !it.questions.length) return false;
  els.transferQuestions.innerHTML="";
  let rendered=0;
  it.questions.forEach((q,qi)=>{
    if(!q || !Array.isArray(q.choices) || q.choices.length<2) return;
    const wrap=document.createElement("div");
    wrap.className="transfer-question";
    wrap.dataset.transferQ=`${it.id}:q${qi}`;
    wrap.innerHTML=`<p class="question-text">${esc(q.text)}</p><div class="cg"></div>`;
    els.transferQuestions.appendChild(wrap);
    const key=`${it.id}:q${qi}`;
    const ok=renderChoiceGroup(wrap.querySelector(".cg"),q,t.answers[key],i=>{
      t.answers[key]=i;
      setActiveSession(transferSessionSnapshot("transfer"),{save:true});
      renderTransfer();
    });
    if(ok) rendered++;
  });
  return rendered===it.questions.length && rendered>0;
}
function ensureTransferAnswerUi(){
  const t=state.transfer,it=t?.items?.[t.idx];
  if(!t || !it || !els.transferQuestions) return false;
  const expectedQs=it.questions?.length||0;
  const expectedChoices=(it.questions||[]).reduce((n,q)=>n+(q.choices?.length||0),0);
  const actualQs=els.transferQuestions.querySelectorAll(".transfer-question").length;
  const actualChoices=els.transferQuestions.querySelectorAll(".choice").length;
  if(expectedQs<1 || expectedChoices<2 || actualQs!==expectedQs || actualChoices!==expectedChoices){
    return renderTransferQuestions();
  }
  return true;
}
function renderTransfer(){
  const t=state.transfer,it=t?.items?.[t.idx];
  if(!t || !it){
    toast("本番相当類題データを表示できません。");
    return;
  }

  const choicesOk=renderTransferQuestions();
  if(els.transferUiError){
    els.transferUiError.classList.toggle("hidden",choicesOk);
    els.transferUiError.innerHTML=choicesOk?"":'<strong>回答選択肢を表示できませんでした。</strong><p>この状態では音声再生・回答を行いません。</p>';
  }

  const level=t.mode==="long"?"Level 3":"Level 2";
  if(els.transferLevelTitle) els.transferLevelTitle.textContent=`${level} 本番相当`;
  if(els.transferHeading) els.transferHeading.textContent=t.retentionOnly?"【定着確認・本番相当】":"【オリジナル類題・本番相当】";
  if(els.transferDescription) els.transferDescription.textContent=t.mode==="long"
    ? "160〜260語程度の長い話＋2問で、本番に近い情報保持・照合を確認します。"
    : "過去問に近い会話量・情報更新・不要情報を含む短会話で転移を確認します。";
  if(els.transferProgress) els.transferProgress.textContent=`${t.idx+1} / ${t.items.length}`;
  if(els.transferBar) els.transferBar.style.width=`${(t.idx+1)/t.items.length*100}%`;
  if(els.transferProfile) els.transferProfile.innerHTML=[
    `<span class="pill">${it.kind==="long"?"長文":"短会話"}</span>`,
    `<span class="pill">約${it.wordCount||0}語</span>`,
    it.turnCount?`<span class="pill">${it.turnCount}ターン</span>`:"",
    `<span class="pill">${(it.tags||[]).map(x=>esc(SKILL_LABELS[x]||x)).join(" / ")}</span>`
  ].join("");
  if(els.transferAudioStatus) els.transferAudioStatus.textContent=t.played[it.id]?"再生済み":"準備完了";
  if(els.transferPlayBtn) els.transferPlayBtn.disabled=!choicesOk || !!t.played[it.id] || state.speaking;
  if(els.transferFeedback){els.transferFeedback.classList.add("hidden");els.transferFeedback.innerHTML="";}
  if(els.transferSubmitBtn){
    const answered=allAnswered(it.questions,(q,qi)=>t.answers[`${it.id}:q${qi}`]);
    els.transferSubmitBtn.disabled=!listeningReady({choicesOk,played:!!t.played[it.id],answered});
  }
}
async function playTransfer(){
  const t=state.transfer,it=t?.items?.[t.idx];
  if(!t || !it || t.played[it.id] || state.speaking) return;
  if(!ensureTransferAnswerUi()){
    toast("回答選択肢を表示できないため、音声再生を開始しませんでした。");
    return;
  }
  els.transferPlayBtn.disabled=true;
  els.transferAudioStatus.textContent="音声を準備中…";
  try{
    await playStimulusQueued(transferItemStimulus(it,t.idx+1),els.transferAudioStatus,1);
    t.played[it.id]=true;
  }catch(err){
    t.played[it.id]=false;
    els.transferAudioStatus.textContent=speechFailureMessage();
    toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
  }finally{
    setActiveSession(transferSessionSnapshot("transfer"),{save:true});
    renderTransfer();
    if(!t.played[it.id]) els.transferAudioStatus.textContent=speechFailureMessage();
  }
}
function submitTransfer(){
  const t=state.transfer,it=t.items[t.idx];
  if(!t.played[it.id]){toast("先に音声を1回聞いてください。");return;}
  const answers=it.questions.map((q,qi)=>t.answers[`${it.id}:q${qi}`]);
  if(answers.some(x=>x==null)){toast("すべての設問に回答してください。");return;}
  let localCorrect=0;
  it.questions.forEach((q,qi)=>{if(answers[qi]===q.correct)localCorrect++;});
  t.correct+=localCorrect;
  setActiveSession(transferSessionSnapshot("transfer-submitted"),{save:true});
  const allLocal=localCorrect===it.questions.length;
  els.transferFeedback.classList.remove("hidden","ok","ng");
  els.transferFeedback.classList.add(allLocal?"ok":"ng");
  els.transferFeedback.innerHTML=`<strong>${allLocal?"○ このセットは正解":"× 要確認"}</strong>
    ${it.questions.map((q,qi)=>`<p>Q${qi+1} 正解: ${KANA[q.correct]} ${esc(q.choices[q.correct])}<br>${esc(q.explanation||"")}</p>`).join("")}
    ${transcriptHtml(it.turns)}
    <div class="answer-review-actions">
      <button id="transferReplayAfterAnswer" class="secondary" type="button">もう一度音声を再生</button>
      <button id="transferContinue" class="primary" type="button">${t.idx<t.items.length-1?"次の本番相当類題":"結果を確認して次へ"}</button>
    </div>`;
  els.transferSubmitBtn.disabled=true;
  lockChoiceButtons(els.transferQuestions);
  const replayBtn=$("transferReplayAfterAnswer");
  replayBtn?.addEventListener("click",()=>{
    replayOriginalAfterAnswer(transferItemStimulus(it,t.idx+1),els.transferAudioStatus,replayBtn);
  });
  $("transferContinue").addEventListener("click",advanceTransfer);
}
function advanceTransfer(){
  const t=state.transfer;
  if(t.idx<t.items.length-1){
    t.idx++;
    setActiveSession(transferSessionSnapshot("transfer"),{save:true});
    renderTransfer();return;
  }
  const required=t.totalQuestions;
  const passed=t.correct===required;
  if(passed) transferPassed();
  else transferFailed();
}
function transferPassed(){
  const t=state.transfer;
  if(t.context==="retention"){
    (t.tags||[]).forEach(tag=>{
      const prev=state.progress.mastery[tag]||{};
      state.progress.mastery[tag]={...prev,status:"mastered",retentionMode:t.mode,linkedTags:[...(t.tags||[])],updated:new Date().toISOString(),lastScore:`transfer retention ${t.correct}/${t.totalQuestions}`};
    });
    markDailyStep(`retention-transfer:${t.mode}:${(t.tags||[]).slice().sort().join("+")}:${(t.items||[]).map(x=>x.id).join("+")}`);
    state.progress.activeSession=null;
    saveProgress();
    toast("本番相当の情報量でも定着を確認できました。");
    showView("dashboardView");renderDashboard();
    return;
  }
  if(t.context==="standalone"){
    (t.tags||[]).forEach(tag=>{
      const prev=state.progress.mastery[tag]||{};
      state.progress.mastery[tag]={...prev,status:"provisional",due:addDaysISO(3),retentionMode:t.mode,linkedTags:[...(t.tags||[])],sourceProfile:t.sourceProfile||prev.sourceProfile,updated:new Date().toISOString(),lastScore:`transfer ${t.correct}/${t.totalQuestions}`};
    });
    markDailyStep(`recovery-transfer:${t.mode}:${(t.tags||[]).slice().sort().join("+")}:${(t.items||[]).map(x=>x.id).join("+")}`);
    state.progress.pending=null;state.progress.activeSession=null;saveProgress();
    showView("dashboardView");renderDashboard();
    return;
  }
  const p=state.progress.pending;
  if(p?.type==="drill-sequence"){
    p.tags.forEach(tag=>{
      const prev=state.progress.mastery[tag]||{};
      state.progress.mastery[tag]={...prev,status:"provisional",due:addDaysISO(3),retentionMode:t.mode,linkedTags:[...p.tags],sourceProfile:t.sourceProfile,updated:new Date().toISOString(),lastScore:`transfer ${t.correct}/${t.totalQuestions}`};
    });
    saveProgress();
    completeCurrentRemediationGroup();
  }
}
function transferFailed(){
  const t=state.transfer;
  const tags=t.tags||[];
  tags.forEach(tag=>{
    const prev=state.progress.mastery[tag]||{};
    state.progress.mastery[tag]={...prev,status:"needs-practice",retentionMode:t.mode,sourceProfile:t.sourceProfile||prev.sourceProfile,updated:new Date().toISOString(),lastScore:`transfer ${t.correct}/${t.totalQuestions}`};
  });
  if(t.context==="retention"){
    markDailyStep(`retention-transfer:${t.mode}:${tags.slice().sort().join("+")}:${(t.items||[]).map(x=>x.id).join("+")}`);
  }
  saveProgress();
  if(t.context==="remediation" && state.progress.pending?.type==="drill-sequence"){
    state.progress.pending.stage="script";
    saveProgress();
    alert("本番相当の情報量では基準未達でした。スクリプト練習へ戻ります。");
    restoreScriptFromPending();
  }else{
    state.progress.pending={type:"retention-recovery",stage:"drill",tags:[...tags],index:0,mode:t.mode,sourceProfile:t.sourceProfile||null};
    state.progress.activeSession=null;
    saveProgress();
    toast("本番相当の定着確認は完了しました。次は関連する弱点をミニ練習からやり直します。");
    showView("dashboardView");renderDashboard();
  }
}
function resumeTransferFromPending(){
  const p=state.progress.pending;
  if(!p) {showView("dashboardView");renderDashboard();return;}
  const mode=p.transferMode || (p.type==="drill-sequence"?transferModeForPending(p):p.mode);
  const tags=p.tags || (p.tag?[p.tag]:[]);
  const profile=p.sourceProfile || (p.type==="drill-sequence"?sourceProfileForPending(p):null);
  startTransfer(mode,tags,{context:p.type==="standalone-transfer"?"standalone":"remediation",retentionOnly:false,sourceProfile:profile,preferredIds:p.transferItemIds||null});
}

// ---------- Original drill ----------
function bankForTag(tag,retentionOnly=false){
  return (window.LISTENING_ORIGINAL_BANK||[]).filter(x=>x.tag===tag && (!!x.retentionOnly)===retentionOnly);
}
function chooseBankItems(tag,n,exclude=[]){
  const all=bankForTag(tag,false);
  state.progress.seenBankIds ||= {};
  state.progress.seenBankIds[tag] ||= [];
  const seen=new Set(state.progress.seenBankIds[tag]);
  const ex=new Set(exclude);
  let pool=all.filter(x=>!seen.has(x.id) && !ex.has(x.id));
  // Immediate drills may reuse old mini-drills after the pool is exhausted.
  // Retention checks use a separate reserved pool and are never consumed here.
  if(pool.length<n) pool=all.filter(x=>!ex.has(x.id));
  const result=pool.slice(0,n);
  result.forEach(x=>seen.add(x.id));
  state.progress.seenBankIds[tag]=[...seen];
  saveProgress();
  return result;
}
function chooseRetentionItem(tag){
  const all=bankForTag(tag,true);
  state.progress.retentionSeen ||= {};
  state.progress.retentionSeen[tag] ||= [];
  const seen=new Set(state.progress.retentionSeen[tag]);
  let item=all.find(x=>!seen.has(x.id));
  if(!item) item=all[0];
  if(item){
    seen.add(item.id);
    state.progress.retentionSeen[tag]=[...seen];
    saveProgress();
  }
  return item;
}
function startDrill(tag, extra=false){
  const used=state.drill?.usedIds || [];
  const items=chooseBankItems(tag,extra?2:3,used);
  if(!items.length){
    toast("オリジナル類題データがありません。");
    showView("dashboardView");renderDashboard();return false;
  }
  state.drill={tag,items,idx:0,answers:[],correct:0,usedIds:[...used,...items.map(x=>x.id)],played:{},phase:extra?"extra":"initial",firstCorrect:extra?state.drill?.correct||0:0,firstTotal:extra?3:0};
  setActiveSession(drillSessionSnapshot("drill"),{save:true});
  showView("drillView");renderDrill();
  if(!ensureDrillAnswerUi()){
    if(els.drillPlayBtn) els.drillPlayBtn.disabled=true;
    if(els.drillSubmitBtn) els.drillSubmitBtn.disabled=true;
  }
  return true;
}
function ensureDrillAnswerUi(){
  const d=state.drill,it=d?.items?.[d.idx];
  if(!d || !it || !els.drillChoices) return false;
  const expected=it.choices?.length||0;
  const actual=els.drillChoices.querySelectorAll(".choice").length;
  if(actual!==expected || expected<2){
    return renderChoiceGroup(els.drillChoices,it,d.answers[d.idx],i=>{
      d.answers[d.idx]=i;
      setActiveSession(drillSessionSnapshot("drill"),{save:true});
      renderDrill();
    });
  }
  return true;
}
function renderDrill(){
  const d=state.drill,it=d?.items?.[d.idx];
  if(!d || !it){
    toast("類題データを表示できません。");
    return;
  }

  if(els.drillQuestion) els.drillQuestion.textContent=it.question;
  const choicesOk=renderChoiceGroup(els.drillChoices,it,d.answers[d.idx],i=>{
    d.answers[d.idx]=i;
    setActiveSession(drillSessionSnapshot("drill"),{save:true});
    renderDrill();
  });
  if(els.drillUiError){
    els.drillUiError.classList.toggle("hidden",choicesOk);
    els.drillUiError.innerHTML=choicesOk?"":'<strong>回答選択肢を表示できませんでした。</strong><p>この状態では音声再生・回答を行いません。</p>';
  }

  if(els.drillTagTitle) els.drillTagTitle.textContent=SKILL_LABELS[d.tag]||d.tag;
  if(els.drillProgress) els.drillProgress.textContent=`${d.idx+1} / ${d.items.length}`;
  if(els.drillBar) els.drillBar.style.width=`${(d.idx+1)/d.items.length*100}%`;
  if(els.drillAudioStatus) els.drillAudioStatus.textContent=d.played[it.id]?"再生済み":"1回で必要情報を拾う";
  if(els.drillPlayBtn) els.drillPlayBtn.disabled=!choicesOk || !!d.played[it.id] || state.speaking;
  const snapshots=state.progress.pending?.causeSnapshot||[];
  const causes=[...new Set(snapshots.map(x=>x.cause).filter(Boolean))];
  if(els.drillCauseHint){
    if(causes.length){
      els.drillCauseHint.classList.remove("hidden");
      els.drillCauseHint.textContent=`今回の重点：${causes.map(c=>CAUSE_LABELS[c]||c).join(" / ")}。${causes.map(c=>causeRecommendation(c,[d.tag])).join(" ")}`;
    }else{
      els.drillCauseHint.classList.add("hidden");
      els.drillCauseHint.textContent="";
    }
  }
  if(els.drillFeedback){els.drillFeedback.classList.add("hidden");els.drillFeedback.innerHTML="";}
  if(els.drillSubmitBtn){
    const answered=d.answers[d.idx]!=null;
    els.drillSubmitBtn.disabled=!listeningReady({choicesOk,played:!!d.played[it.id],answered});
  }
}
async function playDrill(){
  const d=state.drill,it=d?.items?.[d.idx];
  if(!d || !it || d.played[it.id] || state.speaking)return;
  if(!ensureDrillAnswerUi()){
    toast("回答選択肢を表示できないため、音声再生を開始しませんでした。");
    return;
  }
  const stim={number:d.idx+1,kind:"short",turns:it.turns,questions:[{text:it.question}]};
  els.drillPlayBtn.disabled=true;
  els.drillAudioStatus.textContent="音声を準備中…";
  try{
    await playStimulusQueued(stim,els.drillAudioStatus,1);
    d.played[it.id]=true;
  }catch(err){
    d.played[it.id]=false;
    els.drillAudioStatus.textContent=speechFailureMessage();
    toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
  }finally{
    setActiveSession(drillSessionSnapshot("drill"),{save:true});
    renderDrill();
    if(!d.played[it.id]) els.drillAudioStatus.textContent=speechFailureMessage();
  }
}
function submitDrill(){
  const d=state.drill,it=d.items[d.idx],ans=d.answers[d.idx];
  if(!d.played[it.id]){toast("先に音声を1回聞いてください。");return;}
  if(ans==null){toast("回答を選んでください。");return;}
  const ok=ans===it.correct; if(ok)d.correct++;
  setActiveSession(drillSessionSnapshot("drill-submitted"),{save:true});
  els.drillFeedback.classList.remove("hidden","ok","ng"); els.drillFeedback.classList.add(ok?"ok":"ng");
  els.drillFeedback.innerHTML=`<strong>${ok?"○ 正解":"× 不正解"}</strong>
    <p>正解: ${KANA[it.correct]} ${esc(it.choices[it.correct])}</p>
    <p>${esc(it.explanation)}</p>
    ${transcriptHtml(it.turns)}
    <div class="answer-review-actions">
      <button id="drillReplayAfterAnswer" class="secondary" type="button">もう一度音声を再生</button>
      <button id="drillContinue" class="primary" type="button">${d.idx===d.items.length-1?"結果を確認して次へ":"次の類題"}</button>
    </div>
    <p class="small">【オリジナル類題】</p>`;
  els.drillSubmitBtn.disabled=true;
  lockChoiceButtons(els.drillChoices);
  const replayBtn=$("drillReplayAfterAnswer");
  replayBtn?.addEventListener("click",()=>{
    const stim={number:d.idx+1,kind:"short",turns:it.turns,questions:[{text:it.question}]};
    replayOriginalAfterAnswer(stim,els.drillAudioStatus,replayBtn);
  });
  $("drillContinue").addEventListener("click",advanceDrill);
}
function advanceDrill(){
  const d=state.drill;
  if(d.idx<d.items.length-1){
    d.idx++;
    setActiveSession(drillSessionSnapshot("drill"),{save:true});
    renderDrill();return;
  }
  if(d.phase==="initial"){
    if(d.correct===3){ provisionalPass(d.tag,3,3); return; }
    if(d.correct===2){
      const tag=d.tag,used=d.usedIds,first=d.correct;
      const extras=chooseBankItems(tag,2,used);
      state.drill={tag,items:extras,idx:0,answers:[],correct:0,usedIds:[...used,...extras.map(x=>x.id)],played:{},phase:"extra",firstCorrect:first,firstTotal:3};
      setActiveSession(drillSessionSnapshot("drill"),{save:true});
      renderDrill(); return;
    }
    failDrill(d.tag,d.correct,3); return;
  }else{
    const totalCorrect=d.firstCorrect+d.correct;
    if(totalCorrect>=4) provisionalPass(d.tag,totalCorrect,5);
    else failDrill(d.tag,totalCorrect,5);
  }
}
function provisionalPass(tag,correct,total){
  const p=state.progress.pending;
  const prev=state.progress.mastery[tag]||{};
  const priorMode=prev.retentionMode||"mini";

  if(p?.type==="drill-sequence"){
    state.progress.mastery[tag]={...prev,status:"mini-cleared",lastScore:`mini ${correct}/${total}`,updated:new Date().toISOString()};
    if(p.index<p.tags.length-1){
      p.index++;saveProgress();startDrill(p.tags[p.index]);return;
    }
    const mode=transferModeForPending(p);
    const profile=sourceProfileForPending(p);
    if(mode==="mini"){
      finalizePendingMiniAsProvisional("mini");
      completeCurrentRemediationGroup();
      return;
    }
    p.stage="transfer";
    p.transferMode=mode;
    p.sourceProfile=profile;
    saveProgress();
    startTransfer(mode,p.tags,{context:"remediation",retentionOnly:false,sourceProfile:profile});
    return;
  }

  if(p?.type==="retention-recovery"){
    state.progress.mastery[tag]={...prev,status:"mini-cleared",retentionMode:p.mode,linkedTags:[...(p.tags||[])],sourceProfile:p.sourceProfile||prev.sourceProfile,updated:new Date().toISOString(),lastScore:`mini ${correct}/${total}`};
    if(p.index<p.tags.length-1){
      p.index++;saveProgress();startDrill(p.tags[p.index]);return;
    }
    state.progress.pending={type:"standalone-transfer",stage:"transfer",tag:p.tags[0],tags:[...p.tags],mode:p.mode,transferMode:p.mode,sourceProfile:p.sourceProfile||null};
    saveProgress();
    startTransfer(p.mode,p.tags,{context:"standalone",retentionOnly:false,sourceProfile:p.sourceProfile||null});
    return;
  }

  // A failed spaced check may send the user back through the mini drill.
  // If that skill requires exam-like transfer, do not declare provisional mastery yet.
  if(["short","long"].includes(priorMode)){
    state.progress.mastery[tag]={...prev,status:"mini-cleared",lastScore:`mini ${correct}/${total}`,updated:new Date().toISOString()};
    state.progress.pending={type:"standalone-transfer",stage:"transfer",tag,tags:[tag],mode:priorMode,transferMode:priorMode,sourceProfile:prev.sourceProfile||null};
    saveProgress();
    startTransfer(priorMode,[tag],{context:"standalone",retentionOnly:false,sourceProfile:prev.sourceProfile||null});
    return;
  }

  state.progress.mastery[tag]={...prev,status:"provisional",due:addDaysISO(3),retentionMode:"mini",lastScore:`mini ${correct}/${total}`,updated:new Date().toISOString()};
  if(prev.status==="needs-practice"){
    markDailyStep(`recovery-mini:${tag}:${(state.drill?.usedIds||[]).join("+")}`);
  }
  state.progress.activeSession=null;
  saveProgress();
  showView("dashboardView");renderDashboard();
}
function failDrill(tag,correct,total){
  const prev=state.progress.mastery[tag]||{};
  state.progress.mastery[tag]={...prev,status:"needs-practice",lastScore:`mini ${correct}/${total}`,updated:new Date().toISOString()};
  const p=state.progress.pending;
  if(p?.type==="drill-sequence"){
    p.stage="script";
    saveProgress();
    alert(`${correct}/${total}でした。スクリプト練習に戻ります。`);
    restoreScriptFromPending();
    return;
  }
  saveProgress();
  alert(`${correct}/${total}でした。弱点ミニ練習をもう一度行います。`);
  startDrill(tag);
}
function completeCurrentRemediationGroup(){
  const p=state.progress.pending,r=state.rediagnosis;
  if(!p){
    clearActiveSession({save:false});saveProgress();showView("dashboardView");renderDashboard();return;
  }
  const att=getInitial(p.year);
  if(!att){state.progress.pending=null;state.progress.activeSession=null;saveProgress();showView("dashboardView");renderDashboard();return;}

  const processed=Array.isArray(p.groupQids)&&p.groupQids.length
    ? p.groupQids
    : (r?.groups?.[r.idx]?.qids||fullWrongGroups(p.year)[p.groupIndex]?.qids||[]);
  att.completedRemediationQids=[...new Set([...(att.completedRemediationQids||[]),...processed])];

  // Keep the old group-index field only when the entire original stimulus group is complete.
  // A 60-point target may process only the A question in an A+B stimulus; marking the whole
  // legacy group there would incorrectly hide the B question after a later target upgrade.
  att.completedGroups ||= [];
  const originalGroup=fullWrongGroups(p.year)[Number(p.groupIndex)];
  const explicitDone=new Set(att.completedRemediationQids||[]);
  if(originalGroup && originalGroup.qids.every(qid=>explicitDone.has(qid)) &&
     !att.completedGroups.includes(Number(p.groupIndex))){
    att.completedGroups.push(Number(p.groupIndex));
  }

  const allDone=(att.wrongQids||[]).every(qid=>completedRemediationQidSet(p.year).has(qid));
  att.remediationComplete=allDone || !(att.wrongQids||[]).length;
  markDailyStep(`remediation:${p.year}:${processed.slice().sort().join("+")}`);
  state.progress.pending=null;
  state.progress.activeSession=null;
  saveProgress();
  showView("dashboardView");renderDashboard();
}
function buildWrongGroups(year){
  return fullWrongGroups(year);
}
function resumeRemediation(year){
  const groups=buildTargetWrongGroups(year,{remainingOnly:true});
  if(!groups.length){
    toast(`${targetGoalLabel()}で必須補強する問題は残っていません。`);
    showView("dashboardView");renderDashboard();return;
  }
  state.rediagnosis={year,groups,idx:0,answers:{},played:{},revealed:false,targetScore:currentTargetScore()};
  setActiveSession(rediagnosisSessionSnapshot("rediagnosis"),{save:true});
  showView("rediagnosisView");renderRediagnosis();
}

function restoreScriptFromPending(){
  const p=state.progress.pending;
  if(!p || p.type!=="drill-sequence"){
    clearActiveSession({save:false});saveProgress();showView("dashboardView");renderDashboard();return;
  }
  if(!pendingAllowedForTarget(p)){
    state.progress.pending=null;state.progress.activeSession=null;saveProgress();showView("dashboardView");renderDashboard();return;
  }
  const all=fullWrongGroups(p.year);
  const original=(p.groupId&&all.find(x=>x.id===p.groupId))||all[p.groupIndex];
  if(!original){state.progress.pending=null;state.progress.activeSession=null;saveProgress();showView("dashboardView");renderDashboard();return;}
  const qids=(p.groupQids||original.qids).filter(qid=>qMap(p.year)[qid]?.q);
  const g={...original,qids};
  state.rediagnosis={year:p.year,groups:[g],idx:0,answers:{},played:{},revealed:true,targetScore:p.targetScore||currentTargetScore()};
  state.script={
    year:p.year,groupIndex:p.groupIndex,groupId:p.groupId||original.id,group:g,
    hidden:false,highlight:false,targetScore:p.targetScore||currentTargetScore()
  };
  setActiveSession(scriptSessionSnapshot(),{save:true});
  showView("scriptView");renderScript();
}

// ---------- Retention ----------
function startRetention(tag){
  const item=chooseRetentionItem(tag);
  if(!item){
    toast("定着確認用の未見類題がありません。");
    showView("dashboardView");renderDashboard();return;
  }
  state.retention={tag,item,answer:null,played:false};
  setActiveSession(retentionSessionSnapshot("retention"),{save:true});
  showView("retentionView");renderRetention();
  if(!ensureRetentionAnswerUi()){
    if(els.retentionPlayBtn) els.retentionPlayBtn.disabled=true;
    if(els.retentionSubmitBtn) els.retentionSubmitBtn.disabled=true;
  }
}
function ensureRetentionAnswerUi(){
  const r=state.retention,it=r?.item;
  if(!r || !it || !els.retentionChoices) return false;
  const expected=it.choices?.length||0;
  const actual=els.retentionChoices.querySelectorAll(".choice").length;
  if(expected<2 || actual!==expected){
    return renderChoiceGroup(els.retentionChoices,it,r.answer,i=>{
      r.answer=i;
      setActiveSession(retentionSessionSnapshot("retention"),{save:true});
      renderRetention();
    });
  }
  return true;
}
function renderRetention(){
  const r=state.retention,it=r?.item;
  if(!r || !it){
    toast("定着確認データを表示できません。");
    return;
  }

  if(els.retentionQuestion) els.retentionQuestion.textContent=it.question;
  const choicesOk=renderChoiceGroup(els.retentionChoices,it,r.answer,i=>{
    r.answer=i;
    setActiveSession(retentionSessionSnapshot("retention"),{save:true});
    renderRetention();
  });
  if(els.retentionUiError){
    els.retentionUiError.classList.toggle("hidden",choicesOk);
    els.retentionUiError.innerHTML=choicesOk?"":'<strong>回答選択肢を表示できませんでした。</strong><p>この状態では音声再生・回答を行いません。</p>';
  }

  if(els.retentionTitle) els.retentionTitle.textContent=`${SKILL_LABELS[r.tag]||r.tag} の定着確認`;
  if(els.retentionAudioStatus) els.retentionAudioStatus.textContent=r.played?"再生済み":"準備完了";
  if(els.retentionPlayBtn) els.retentionPlayBtn.disabled=!choicesOk || r.played || state.speaking;
  if(els.retentionFeedback){els.retentionFeedback.classList.add("hidden");els.retentionFeedback.innerHTML="";}
  if(els.retentionSubmitBtn){
    els.retentionSubmitBtn.disabled=!listeningReady({choicesOk,played:!!r.played,answered:r.answer!=null});
  }
}
async function playRetention(){
  const r=state.retention;
  if(!r || !r.item || r.played || state.speaking)return;
  if(!ensureRetentionAnswerUi()){
    toast("回答選択肢を表示できないため、音声再生を開始しませんでした。");
    return;
  }
  els.retentionPlayBtn.disabled=true;
  els.retentionAudioStatus.textContent="音声を準備中…";
  try{
    await playStimulusQueued({number:1,kind:"short",turns:r.item.turns,questions:[{text:r.item.question}]},els.retentionAudioStatus,1);
    r.played=true;
  }catch(err){
    r.played=false;
    els.retentionAudioStatus.textContent=speechFailureMessage();
    toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
  }finally{
    setActiveSession(retentionSessionSnapshot("retention"),{save:true});
    renderRetention();
    if(!r.played) els.retentionAudioStatus.textContent=speechFailureMessage();
  }
}
function submitRetention(){
  const r=state.retention;
  if(!r.played){toast("先に音声を1回聞いてください。");return;}
  if(r.answer==null){toast("回答を選んでください。");return;}
  const ok=r.answer===r.item.correct;
  lockChoiceButtons(els.retentionChoices);
  els.retentionSubmitBtn.disabled=true;
  els.retentionFeedback.classList.remove("hidden","ok","ng");els.retentionFeedback.classList.add(ok?"ok":"ng");
  const reviewBlock=`${transcriptHtml(r.item.turns)}
    <div class="answer-review-actions">
      <button id="retentionReplayAfterAnswer" class="secondary" type="button">もう一度音声を再生</button>
      <span id="retentionNextAction"></span>
    </div>`;
  if(ok){
    state.progress.mastery[r.tag]={status:"mastered",updated:new Date().toISOString(),lastScore:"retention 1/1"};
    markDailyStep(`retention-mini:${r.tag}:${r.item.id}`);
    state.progress.activeSession=null;saveProgress();
    els.retentionFeedback.innerHTML=`<strong>○ 定着</strong><p>${esc(r.item.explanation)}</p>${reviewBlock}`;
    $("retentionNextAction").innerHTML='<button id="retHome" class="primary" type="button">ダッシュボードへ</button>';
    $("retHome").addEventListener("click",()=>{showView("dashboardView");renderDashboard();});
  }else{
    state.progress.mastery[r.tag]={status:"needs-practice",updated:new Date().toISOString(),lastScore:"retention 0/1"};
    markDailyStep(`retention-mini:${r.tag}:${r.item.id}`);
    setActiveSession(retentionSessionSnapshot("retention-failed"),{save:false});saveProgress();
    els.retentionFeedback.innerHTML=`<strong>× もう一度補強</strong><p>正解: ${KANA[r.item.correct]} ${esc(r.item.choices[r.item.correct])}</p><p>${esc(r.item.explanation)}</p>${reviewBlock}`;
    $("retentionNextAction").innerHTML='<button id="retDrill" class="primary" type="button">ダッシュボードへ</button>';
    $("retDrill").addEventListener("click",()=>{
      showView("dashboardView");renderDashboard();
    });
  }
  const replayBtn=$("retentionReplayAfterAnswer");
  replayBtn?.addEventListener("click",()=>{
    const stim={number:1,kind:"short",turns:r.item.turns,questions:[{text:r.item.question}]};
    replayOriginalAfterAnswer(stim,els.retentionAudioStatus,replayBtn);
  });
}

// ---------- History ----------

function difficultyLabel(q){
  const d=qGrade(q);
  return {
    code:d,
    text:d==="A"?"60点目標で優先":d==="B"?"70点目標で追加":"75点目標で追加",
    inTarget:gradeInTarget(d),
    advice:TARGET_STRATEGY.gradeAdvice(currentTargetScore(),d)
  };
}
function stimulusScriptHtml(stimulus){
  if(stimulus.kind==="short"){
    return (stimulus.turns||[]).map(t=>`<div class="review-script-line"><strong>${esc(t.role)}</strong><span>${esc(t.text)}</span></div>`).join("");
  }
  return `<div class="review-passage">${esc(stimulus.passage||"")}</div>`;
}
function reviewItemsForYear(year){
  const y=yearData(year);
  if(!y) return [];
  const att=getInitial(year);
  const out=[];
  y.stimuli.forEach(stimulus=>stimulus.questions.forEach((q,qi)=>{
    out.push({year,stimulus,q,questionIndex:qi,attempt:att});
  }));
  return out;
}
function renderReviewLibrary(items, title, description){
  state.review={items,title,description};
  els.reviewTitle.textContent=title;
  els.reviewHeading.textContent=title;
  els.reviewDescription.textContent=description||"";
  els.reviewCount.textContent=`${items.length}問`;
  if(!items.length){
    els.reviewList.innerHTML='<div class="empty-review"><strong>対象問題はありません。</strong><p class="small">まだこの条件での失点記録がありません。</p></div>';
    showView("reviewView"); return;
  }
  els.reviewList.innerHTML=items.map((it,i)=>{
    const {year,stimulus,q,attempt}=it;
    const diff=difficultyLabel(q);
    const ans=attempt?.answers?.[q.id];
    const isWrong=attempt?.wrongQids?.includes(q.id);
    return `<article class="review-question-card" id="review-${esc(q.id)}">
      <button type="button" class="review-question-summary" data-review-index="${i}" aria-expanded="false">
        <span class="review-number">${year} · 大問${stimulus.section} · No.${stimulus.number}${stimulus.questions.length>1?` Q${it.questionIndex+1}`:""}</span>
        <span class="difficulty-chip diff-${diff.code.toLowerCase()}"><strong>${diff.code}</strong> ${diff.text}</span>
        <span class="pill">${diff.inTarget?"現在の目標で必須":"現在の目標では後回し"}</span>
        <span class="review-result ${isWrong?"wrong":"correct"}">${ans==null?"未回答":isWrong?"初回 ×":"初回 ○"}</span>
        <span class="review-open-hint">復習する ↓</span>
      </button>
      <div class="review-question-detail hidden">
        <p class="question-text">${esc(q.text)}</p>
        <div class="review-choice-grid">${q.choices.map((c,ci)=>{
          const correct=ci===q.correct, mine=ci===ans;
          return `<div class="review-choice ${correct?"is-correct":""} ${mine&&!correct?"is-mine-wrong":""}">
            <span class="kana">${KANA[ci]}</span><span>${esc(c)}</span>
            ${correct?'<strong>正解</strong>':mine?'<span>初回答</span>':""}
          </div>`;
        }).join("")}</div>
        <div class="review-meta-row">
          <span class="pill">${(q.tags||[]).map(t=>esc(SKILL_LABELS[t]||t)).join(" / ")||"内容確認"}</span>
          ${attempt?.diagnostics?.[q.id]?.onePass?'<span class="pill">ONE-PASS不安定</span>':attempt?.diagnostics?.[q.id]?.persistentMiss?'<span class="pill">再診断でも不正解</span>':""}
          ${selectedCause(attempt,q.id)?`<span class="pill">原因: ${esc(CAUSE_LABELS[selectedCause(attempt,q.id)]||selectedCause(attempt,q.id))}</span>`:""}
          <button type="button" class="secondary review-play" data-review-index="${i}">▶ 問題音声を再生</button>
        </div>
        <details class="review-script">
          <summary>スクリプトを開く</summary>
          <div class="review-script-body">
            ${stimulusScriptHtml(stimulus)}
            <div class="review-question-stem"><strong>Question</strong><span>${esc(q.text)}</span></div>
          </div>
        </details>
      </div>
    </article>`;
  }).join("");

  els.reviewList.querySelectorAll(".review-question-summary").forEach(btn=>btn.addEventListener("click",()=>{
    const card=btn.closest(".review-question-card");
    const detail=card.querySelector(".review-question-detail");
    const open=detail.classList.toggle("hidden")===false;
    btn.setAttribute("aria-expanded",open?"true":"false");
    btn.querySelector(".review-open-hint").textContent=open?"閉じる ↑":"復習する ↓";
  }));
  els.reviewList.querySelectorAll(".review-play").forEach(btn=>btn.addEventListener("click",async()=>{
    const it=items[Number(btn.dataset.reviewIndex)];
    const focused={...it.stimulus,questions:[it.q]};
    btn.disabled=true; btn.textContent="再生中…";
    try{
      await playStimulusQueued(focused,null,1);
    }catch(err){
      toast("音声を開始できませんでした。Safariで開くと改善する場合があります。");
    }finally{
      btn.disabled=false;btn.textContent="▶ 問題音声を再生";
    }
  }));
  showView("reviewView");
}
function openYearReview(year){
  const att=getInitial(year);
  if(!att){
    toast(`${year}年度は未実施です。未見性を守るため問題詳細はまだ開きません。`);
    return;
  }
  renderReviewLibrary(
    reviewItemsForYear(year),
    `${year}年度 問題別復習`,
    `初回 ${att.score}/20。現在の学習目標は${targetGoalLabel()}。A/B/Cは学校公式難易度ではなく、この学習システムの受験戦略用分類です。`
  );
}
function openWeaknessReview(tag){
  const items=[];
  for(const year of allInitialYears()){
    const att=getInitial(year),map=qMap(year);
    for(const qid of att.wrongQids||[]){
      const item=map[qid];
      if(item && gradeInTarget(qGrade(item.q)) && (item.q.tags||[]).includes(tag)){
        items.push({year,stimulus:item.stimulus,q:item.q,questionIndex:item.stimulus.questions.findIndex(x=>x.id===qid),attempt:att});
      }
    }
  }
  renderReviewLibrary(
    items,
    `${SKILL_LABELS[tag]||tag} の${targetGoalLabel()}要対策問題`,
    `現在の${targetGoalLabel()}で必須対象になる失点問題をまとめています。目標を変えると対象範囲も変わります。`
  );
}
function renderDashboardHistorySummary(){
  if(!els.dashboardHistorySummary) return;
  const rows=(state.progress.history||[]).slice(0,4);
  els.dashboardHistorySummary.innerHTML=rows.length
    ? `<div class="history-mini-list">${rows.map(r=>`<div class="history-mini-row"><span>${r.year}年度</span><strong>${r.score}/20</strong><span class="small">${new Date(r.date).toLocaleDateString("ja-JP")}</span></div>`).join("")}</div>`
    : '<p class="small">まだ初回受験の履歴はありません。</p>';
}

function renderHistory(){
  const h=state.progress.history||[];
  els.historyTable.innerHTML=h.length?`<table><thead><tr><th>日時</th><th>年度</th><th>初回</th><th>A失点</th></tr></thead><tbody>${h.map(x=>`<tr><td>${esc(new Date(x.date).toLocaleString("ja-JP"))}</td><td>${x.year}</td><td><strong>${x.score}/20</strong></td><td>${x.aMisses}</td></tr>`).join("")}</tbody></table>`:'<p class="small">まだ履歴はありません。</p>';
}

// ---------- Pack loading ----------
async function tryAutoPack(){
  // Authorized public build: official pack is embedded as Base64 to reduce text indexing.
  // This is not encryption or access control; it only avoids shipping searchable plaintext.
  if(APP_CONFIG.bundledPackBase64Var){
    try{
      const encoded=window[APP_CONFIG.bundledPackBase64Var];
      if(encoded){
        const raw=atob(encoded);
        const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
        const text=new TextDecoder("utf-8").decode(bytes);
        const p=JSON.parse(text);
        validatePack(p);
        state.pack=p;
        state.packSource="bundled";
        localStorage.setItem(LS_PACK,JSON.stringify(p));
        return;
      }
    }catch(err){
      console.warn("Bundled pack decode failed:",err);
    }
  }

  // Backward-compatible URL bundle support for private/local builds.
  if(APP_CONFIG.bundledPackUrl){
    try{
      const res=await fetch(APP_CONFIG.bundledPackUrl,{cache:"no-store"});
      if(res.ok){
        const p=await res.json();
        validatePack(p);
        state.pack=p;
        state.packSource="bundled";
        localStorage.setItem(LS_PACK,JSON.stringify(p));
        return;
      }
    }catch(err){
      console.warn("Bundled pack auto-load failed:",err);
    }
  }

  // Saved browser data fallback.
  try{
    const saved=JSON.parse(localStorage.getItem(LS_PACK)||"null");
    if(saved){
      validatePack(saved);
      state.pack=saved;
      state.packSource="saved";
      return;
    }
  }catch{localStorage.removeItem(LS_PACK);}

  state.packSource=null;
}

// ---------- Event wiring ----------

function taskSignature(task){
  if(!task)return "none";
  return [
    task.type||"",task.year||"",task.tag||"",task.mode||"",
    state.progress?.activeSession?.type||"",
    state.progress?.activeSession?.stage||"",
    state.progress?.activeSession?.groupId||"",
    state.progress?.activeSession?.idx??""
  ].join("|");
}
function executeLearningTask(task){
  if(!task)return false;
  if(task.type==="load-pack"){els.packInput.click();return true;}
  if(task.type==="resume-active-session")return restoreActiveSession();
  if(task.type==="exam"){startExam(task.year);return true;}
  if(task.type==="resume-remediation"){resumeRemediation(task.year);return true;}
  if(task.type==="resume-drill")return startDrill(task.tag);
  if(task.type==="resume-script"){restoreScriptFromPending();return true;}
  if(task.type==="resume-transfer"){resumeTransferFromPending();return true;}
  if(task.type==="retention-transfer"){
    const rec=state.progress.mastery?.[task.tag]||{};
    startTransfer(task.mode,task.tags||[task.tag],{context:"retention",retentionOnly:true,sourceProfile:rec.sourceProfile||null});
    return true;
  }
  if(task.type==="retention"){startRetention(task.tag);return true;}
  return false;
}
function launchTodayLearning(){
  // Always recompute from saved state at click time. Do not trust a stale data-task snapshot.
  // A submitted checkpoint may only perform an internal "result/advance" transition and return
  // to the dashboard; in that case continue synchronously until an actual next learning screen opens.
  const seen=new Set();
  for(let guard=0;guard<12;guard++){
    const task=computeNextTask();
    const sig=taskSignature(task);
    if(task.type==="free"){renderDashboard();return;}
    if(seen.has(sig)){
      renderDashboard();
      toast("次の問題を開始できませんでした。ページを再読み込みしてください。学習履歴は保持されています。");
      return;
    }
    seen.add(sig);
    const started=executeLearningTask(task);
    if(!started){
      // A stale exact-resume checkpoint may be cleared by restoreActiveSession().
      // Recompute only for that recovery case; a Level 1 launch failure must stop
      // instead of asking the learner to press the same button repeatedly.
      if(task.type==="resume-active-session"){
        if(state.currentView==="dashboardView") continue;
      }
      if(state.currentView==="dashboardView"){
        renderDashboard();
        toast("次の問題を開始できませんでした。ページを再読み込みしてください。学習履歴は保持されています。");
        return;
      }
      renderDashboard();
      return;
    }
    if(state.currentView!=="dashboardView")return;
    // If a submitted result was consumed and the app intentionally returned to the dashboard,
    // loop once more and open the newly computed next problem/drill immediately.
  }
  renderDashboard();
  toast("学習位置の自動遷移が多すぎたため停止しました。");
}
function bind(){
  els.targetGoalButtons.addEventListener("click",e=>{
    const btn=e.target.closest("[data-target]");
    if(btn) setTargetScore(Number(btn.dataset.target));
  });
  els.todayStartBtn.addEventListener("click",()=>launchTodayLearning());
  els.dashboardBtn.addEventListener("click",()=>{
    saveCurrentSessionCheckpoint();
    window.speechSynthesis?.cancel();
    showView("dashboardView");renderDashboard();
  });
  els.packInput.addEventListener("change",async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      const p=JSON.parse(await f.text());validatePack(p);state.pack=p;state.packSource="manual";localStorage.setItem(LS_PACK,JSON.stringify(p));toast("Private Packを読み込みました。");renderDashboard();
    }catch(err){toast(`読込失敗: ${err.message}`);}
    e.target.value="";
  });
  els.exportProgressBtn.addEventListener("click",exportProgress);
  els.progressImportInput.addEventListener("change",async e=>{
    const f=e.target.files?.[0];
    await importProgressFile(f);
    e.target.value="";
  });
  els.forgetPackBtn.addEventListener("click",()=>{
    localStorage.removeItem(LS_PACK);state.pack=null;state.packSource=null;toast("Private Packのブラウザ保存を外しました。進捗は残しています。");renderDashboard();
  });
  els.resetProgressBtn.addEventListener("click",()=>{
    const typed=prompt("初回得点・弱点・定着履歴をすべて消去します。元に戻せません。\n実行する場合は「リセット」と入力してください。","");
    if(typed==="リセット"){
      const keepTarget=currentTargetScore();
      state.progress=defaultProgress();
      state.progress.targetScore=keepTarget;
      saveProgress();renderDashboard();toast("進捗をリセットしました。学習目標は保持しています。");
    }else if(typed!==null){
      toast("入力が一致しないため、リセットしませんでした。");
    }
  });

  els.rateSlider.addEventListener("input",()=>{state.rate=Number(els.rateSlider.value);els.rateLabel.textContent=`${state.rate.toFixed(2)}×`;});
  [els.maleVoice,els.femaleVoice,els.narratorVoice].forEach(x=>x.addEventListener("change",syncVoices));
  els.voiceTestBtn.addEventListener("click",async()=>{
    els.voiceStatus.textContent="音声テストを再生中です…";
    try{
      await speak("I will meet you after school.","man");
      await speak("Great. I will see you then.","woman");
      await speak("Question. When will they meet?","narrator",.92);
      els.voiceStatus.textContent="音声テストを再生しました。";
    }catch(err){
      console.warn("Voice test failed:",err);
      els.voiceStatus.textContent=speechFailureMessage();
      toast("音声テストを開始できませんでした。ブラウザまたはOSの英語音声設定を確認してください。");
    }
  });

  els.examPlayBtn.addEventListener("click",playExam);els.examNextBtn.addEventListener("click",examNext);
  els.examQuitBtn.addEventListener("click",()=>{
    saveCurrentSessionCheckpoint();
    window.speechSynthesis?.cancel();
    showView("dashboardView");renderDashboard();
    toast("途中状態を保存しました。「続きから次へ進む」で同じ続きから再開できます。");
  });
  els.startRediagnosisBtn.addEventListener("click",()=>{
    if(els.startRediagnosisBtn.dataset.noWrong === "1"){
      showView("dashboardView"); renderDashboard();
    }else{
      startRediagnosis(state.exam.year);
    }
  });
  els.scoreHomeBtn.addEventListener("click",()=>{showView("dashboardView");renderDashboard();});

  els.rediagnosisPlayBtn.addEventListener("click",playRediagnosis);els.rediagnosisSubmitBtn.addEventListener("click",submitRediagnosis);
  els.rediagnosisQuitBtn.addEventListener("click",()=>{
    saveCurrentSessionCheckpoint();showView("dashboardView");renderDashboard();
  });

  els.fullReplayBtn.addEventListener("click",fullScriptReplay);
  els.hideScriptBtn.addEventListener("click",()=>{
    state.script.hidden=!state.script.hidden;setActiveSession(scriptSessionSnapshot(),{save:true});renderScript();
  });
  els.highlightBtn.addEventListener("click",()=>{
    state.script.highlight=!state.script.highlight;setActiveSession(scriptSessionSnapshot(),{save:true});renderScript();
  });
  els.shadowBtn.addEventListener("click",shadowCurrent);els.startDrillBtn.addEventListener("click",startDrillsFromScript);

  els.drillPlayBtn.addEventListener("click",playDrill);els.drillSubmitBtn.addEventListener("click",submitDrill);
  els.drillQuitBtn.addEventListener("click",()=>{
    saveCurrentSessionCheckpoint();showView("dashboardView");renderDashboard();
  });

  els.transferPlayBtn.addEventListener("click",playTransfer);
  els.transferSubmitBtn.addEventListener("click",submitTransfer);
  els.transferQuitBtn.addEventListener("click",()=>{
    saveCurrentSessionCheckpoint();showView("dashboardView");renderDashboard();
  });

  els.retentionPlayBtn.addEventListener("click",playRetention);els.retentionSubmitBtn.addEventListener("click",submitRetention);

  els.historyCloseBtn.addEventListener("click",()=>{showView("dashboardView");renderDashboard();});
  els.openHistoryBtn.addEventListener("click",()=>{renderHistory();showView("historyView");});
  els.reviewBackBtn.addEventListener("click",()=>{window.speechSynthesis?.cancel();showView("dashboardView");renderDashboard();});

  window.addEventListener("beforeunload",()=>{
    saveCurrentSessionCheckpoint();
    window.speechSynthesis?.cancel();
  });
}
function cacheEls(){
  const ids=[
    "dashboardView","examView","scoreOnlyView","rediagnosisView","scriptView","drillView","transferView","retentionView","reviewView","historyView",
    "dashboardBtn","targetGoalBadge","targetGoalButtons","targetGoalSummary","dailyProgress","todayTask","todayStartBtn","remainingDays","dataStatus","packInput","packInputLabel","forgetPackBtn","resetProgressBtn","roadmap","weaknessPanel","retentionPanel",
    "storageStatus","exportProgressBtn","progressImportInput","dashboardHistorySummary","openHistoryBtn",
    "reviewBackBtn","reviewTitle","reviewCount","reviewHeading","reviewDescription","reviewList",
    "rateSlider","rateLabel","maleVoice","femaleVoice","narratorVoice","voiceTestBtn","voiceStatus","toast",
    "examQuitBtn","examTitle","examProgressText","examProgressBar","examSectionLabel","examStimulusLabel","examUiError","examAudioStatus","examPlayBtn","examQuestions","examNextBtn",
    "initialScoreRing","initialScore","initialScoreMessage","startRediagnosisBtn","scoreHomeBtn",
    "rediagnosisQuitBtn","rediagnosisProgress","rediagnosisBar","rediagnosisTitle","rediagnosisAudioStatus","rediagnosisPlayBtn","rediagnosisUiError","rediagnosisQuestions","rediagnosisSubmitBtn","rediagnosisResult",
    "scriptTitle","scriptSkillBadge","answerReveal","fullReplayBtn","hideScriptBtn","highlightBtn","shadowBtn","practiceSpeed","scriptText","causePanel","startDrillBtn",
    "drillQuitBtn","drillTagTitle","drillProgress","drillBar","drillAudioStatus","drillPlayBtn","drillCauseHint","drillUiError","drillQuestion","drillChoices","drillSubmitBtn","drillFeedback",
    "transferQuitBtn","transferLevelTitle","transferProgress","transferBar","transferHeading","transferDescription","transferProfile","transferAudioStatus","transferPlayBtn","transferUiError","transferQuestions","transferSubmitBtn","transferFeedback",
    "retentionTitle","retentionAudioStatus","retentionPlayBtn","retentionUiError","retentionQuestion","retentionChoices","retentionSubmitBtn","retentionFeedback",
    "historyCloseBtn","historyTable","buildBadge"
  ];
  ids.forEach(id=>els[id]=$(id));
}
async function init(){
  cacheEls();
  if(els.buildBadge) els.buildBadge.textContent="Build v22 ✓";
  if(!WS) throw new Error("storage.js を読み込めませんでした。");
  if(!TARGET_STRATEGY) throw new Error("target_strategy.js を読み込めませんでした。");
  state.progress=loadProgress();
  bind();
  await tryAutoPack();
  // Target-aware active-session validation needs the bundled question metadata.
  const hadPending=!!state.progress.pending,hadActive=!!state.progress.activeSession;
  reconcilePendingForTarget();
  reconcileActiveSessionForTarget();
  if((hadPending&&!state.progress.pending)||(hadActive&&!state.progress.activeSession)) saveProgress();
  renderDashboard();
  loadVoices(); if(speechAvailable()){window.speechSynthesis.onvoiceschanged=loadVoices;setTimeout(loadVoices,400);setTimeout(loadVoices,1200);}
}
document.addEventListener("DOMContentLoaded",init);
})();
