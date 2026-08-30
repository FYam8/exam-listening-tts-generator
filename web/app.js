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
  HEAR:"音として聞こえない", VOCAB:"語彙・表現", MEANING:"意味処理",
  UPDATE:"情報更新", CALC:"計算", QUESTION:"設問読み違い", MEMO:"メモ不足", CARELESS:"ケアレス"
};
const LS_PACK = String.fromCharCode(119,97,115,101,115,104,105,98,117) + "-official-pack-v1";
const WS = window.ListeningProgressStorage;
const VOICE_PROFILES = window.ListeningVoiceProfiles;
const STUDY_PLAN = window.ListeningStudyPlan;
const APP_CONFIG = window.LISTENING_APP_CONFIG || {bundledPackBase64Var:null,hidePackControlsWhenBundled:true};
const REQUIRED_YEARS = [2019,2020,2021,2022,2023,2024,2025,2026];

const els = {};
const state = {
  pack:null,
  packSource:null,
  progress:null,
  storageInfo:null,
  voices:[],
  selectedVoices:{man:null,woman:null,narrator:null},
  rate:1,
  speaking:false,
  exam:null,
  rediagnosis:null,
  script:null,
  drill:null,
  retention:null
};

function $(id){ return document.getElementById(id); }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function toast(msg){
  els.toast.textContent = msg; els.toast.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(()=>els.toast.classList.remove("show"), 2600);
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDaysISO(days){
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
function showView(id){
  ["dashboardView","examView","scoreOnlyView","rediagnosisView","scriptView","drillView","retentionView","historyView"]
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
  if(!speechAvailable()){ els.voiceStatus.textContent = "このブラウザは音声合成に対応していません。"; return; }
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
    els.voiceStatus.textContent="英語音声を読み込み中です。数秒後に再確認してください。";
  }
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
    if(!speechAvailable()){ resolve(); return; }
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
    const att = getInitial(year);
    const map = qMap(year);
    for(const qid of att.wrongQids || []){
      const item = map[qid]; if(!item) continue;
      const weight = item.q.difficulty === "A" ? 2 : 1;
      (item.q.tags||[]).forEach(tag=>{
        const r = counts[tag] ||= {miss:0, weight:0, years:new Set()};
        r.miss += 1; r.weight += weight; r.years.add(year);
      });
    }
  }
  return Object.entries(counts).map(([tag,r])=>({tag,miss:r.miss,weight:r.weight,years:[...r.years]}))
    .sort((a,b)=>b.weight-a.weight || b.miss-a.miss);
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
  const a=getInitial(year); return !!a?.remediationComplete;
}
function topWeakTagsFromAttempt(year){
  const att=getInitial(year), map=qMap(year), c={};
  if(!att) return [];
  for(const qid of att.wrongQids||[]){
    const q=map[qid]?.q; if(!q) continue;
    (q.tags||[]).forEach(t=>c[t]=(c[t]||0)+(q.difficulty==="A"?2:1));
  }
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
}
function relevantProvisionalReady(year){
  const tags=topWeakTagsFromAttempt(year).slice(0,2);
  return tags.every(t=>["provisional","mastered"].includes(state.progress.mastery?.[t]?.status));
}
function dueRetention(){
  return Object.entries(state.progress.mastery||{})
    .filter(([,r])=>r.status==="provisional" && r.due && r.due<=todayISO())
    .map(([tag,r])=>({tag,...r}))
    .sort((a,b)=>a.due.localeCompare(b.due))[0] || null;
}

function computeNextTask(){
  if(!state.pack) return {type:"load-pack", title:"Private Packを読み込む", meta:"2019–2026年度の過去問データが必要です。"};

  // Finish the currently active correction cycle before inserting spaced review.
  // The retention window is 2–4 days, so a short delay is acceptable and avoids breaking
  // the "past exam → correction → drill" learning sequence.
  if(state.progress.pending?.type==="drill-sequence"){
    const p=state.progress.pending;
    if(p.stage==="script"){
      return {type:"resume-script",year:p.year,groupIndex:p.groupIndex,title:`${p.year}年度のスクリプト練習を続ける`,meta:"類題で基準未達だったため、根拠区間の聞き直しから再開します。"};
    }
    const tag=p.tags?.[p.index];
    if(tag){
      return {type:"resume-drill",tag,year:p.year,title:`${SKILL_LABELS[tag]||tag} の類題を続ける`,meta:"中断した弱点補強をこの段階から再開します。"};
    }
  }
  for(const y of REQUIRED_YEARS){
    const a=getInitial(y);
    if(a && (a.wrongQids||[]).length && !a.remediationComplete){
      return {type:"resume-remediation", year:y, title:`${y}年度の弱点補強を続ける`, meta:"再診断・スクリプト反復・類題を完了させます。"};
    }
  }

  const due=dueRetention();
  if(due) return {type:"retention", tag:due.tag, title:`${SKILL_LABELS[due.tag]||due.tag} の定着確認`, meta:"2〜4日後の未見類題。1回で取れるか確認します。"};

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
    return {type:"exam",year:y,title:`${y}年度でもう1回補強`,meta:"安定目標14/20・A問題失点1以下・主要弱点の仮合格という条件未達なので、2024の前にもう1年度だけ実施します。"};
  }

  const remainingOld=[2019,2020,2021,2022].filter(y=>!getInitial(y));
  if(remainingOld.length){
    const y=chooseOldYear(); return {type:"exam",year:y,title:`${y}年度で技能完成`,meta:"2019〜2022の残りを弱点に合わせて回します。"};
  }

  if(!getInitial(2025)) return {type:"exam",year:2025,title:"2025年度 直近型模試①",meta:"未見のまま本番形式で実施します。"};
  if(!getInitial(2026)) return {type:"exam",year:2026,title:"2026年度 最終模試",meta:"最後まで未見で残した直近年度です。"};

  return {type:"free",title:"全年度の初回診断完了",meta:"定着確認が来たら優先し、必要なら弱点別類題を続けます。"};
}

function renderDashboard(){
  const task=computeNextTask();
  const estimate=STUDY_PLAN.estimateRemaining(state.progress,REQUIRED_YEARS,todayISO());
  els.todayTask.innerHTML=`
    <div class="task-title">${esc(task.title)}</div>
    <div class="task-meta">${esc(task.meta||"")}</div>
    <div class="task-badges">
      ${task.year?`<span class="pill">${task.year}年度</span>`:""}
      ${task.tag?`<span class="pill">${esc(SKILL_LABELS[task.tag]||task.tag)}</span>`:""}
    </div>`;
  els.todayStartBtn.disabled = task.type==="free";
  els.todayStartBtn.dataset.task = JSON.stringify(task);
  els.remainingDays.textContent=estimate.max===0
    ? "予定していた初回診断と補強が完了しました。"
    : `完了までの目安：あと約${estimate.min}〜${estimate.max}日（毎日1つ進めた場合）`;

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
}
function strategicLabel(score){
  return STUDY_PLAN.strategicLabel(score);
}
function renderRoadmap(){
  const current=computeNextTask().year;
  els.roadmap.innerHTML=REQUIRED_YEARS.map(y=>{
    const a=getInitial(y);
    const cls=a?"done":current===y?"current":"locked";
    return `<div class="year-card ${cls}">
      <div class="year-top"><strong>${y}</strong><span class="status-dot">${a?"初回済":current===y?"次":"未実施"}</span></div>
      ${a?`<div class="year-score">${a.score}/20</div><div class="small">${strategicLabel(a.score)} · A失点 ${a.aMisses}</div>`:`<div class="small">未見を維持</div>`}
    </div>`;
  }).join("");
}
function renderWeakness(){
  const w=computeWeakness();
  if(!w.length){ els.weaknessPanel.innerHTML='<p class="small">まだ診断データがありません。</p>'; return; }
  els.weaknessPanel.innerHTML=`<div class="skill-list">${w.slice(0,7).map(x=>{
    const m=state.progress.mastery?.[x.tag];
    const st=m?.status==="mastered"?"定着":m?.status==="provisional"?"仮合格":"要対策";
    const cls=m?.status==="mastered"?"mastered":m?.status==="provisional"?"provisional":"";
    return `<div class="skill-row"><div><div class="skill-name">${esc(SKILL_LABELS[x.tag]||x.tag)}</div><div class="skill-meta">失点 ${x.miss}問 · ${x.years.join(", ")}</div></div><strong class="${cls}">${st}</strong></div>`;
  }).join("")}</div>`;
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
  container.innerHTML=`<div class="choices">${q.choices.map((c,i)=>{
    let cls="choice"+(selected===i?" selected":"");
    if(reveal){ if(i===q.correct) cls+=" correct"; else if(selected===i && i!==q.correct) cls+=" incorrect"; }
    return `<button type="button" class="${cls}" data-i="${i}"><span class="kana">${KANA[i]}</span><span>${esc(c)}</span></button>`;
  }).join("")}</div>`;
  container.querySelectorAll(".choice").forEach(b=>b.addEventListener("click",()=>onSelect(Number(b.dataset.i))));
}

// ---------- Exam ----------
function startExam(year, retake=false){
  const y=yearData(year); if(!y){toast("年度データがありません。");return;}
  state.exam={year, retake, stimuli:y.stimuli, idx:0, answers:{}, played:{}, started:new Date().toISOString()};
  showView("examView"); renderExam();
}
function renderExam(){
  const e=state.exam,s=e.stimuli[e.idx];
  els.examTitle.textContent=`${e.year}年度 リスニング`;
  els.examProgressText.textContent=`${e.idx+1} / ${e.stimuli.length}`;
  els.examProgressBar.style.width=`${(e.idx+1)/e.stimuli.length*100}%`;
  els.examSectionLabel.textContent=`大問${s.section} · ${s.kind==="short"?"短い会話":"長めの話"}`;
  els.examStimulusLabel.textContent=`Number ${s.number}`;
  els.examAudioStatus.textContent=e.played[s.id]?"再生済み":"準備完了";
  els.examPlayBtn.disabled=!!e.played[s.id] || state.speaking;
  els.examPlayBtn.textContent=e.played[s.id]?"再生済み":"音声を再生";
  els.examNextBtn.textContent=e.idx===e.stimuli.length-1?"採点する":"次へ";

  els.examQuestions.innerHTML="";
  s.questions.forEach((q,j)=>{
    const wrap=document.createElement("div"); wrap.className="question-block";
    const shownStem = s.section === 1
      ? `${s.questions.length>1?`Question ${j+1}`:"Question"}（質問文は音声で読み上げ）`
      : `${s.questions.length>1?`Question ${j+1}`:"Question"}: ${esc(q.text)}`;
    wrap.innerHTML=`<p class="question-text">${shownStem}</p><div class="cg"></div>`;
    els.examQuestions.appendChild(wrap);
    renderChoiceGroup(wrap.querySelector(".cg"), q, e.answers[q.id], i=>{
      e.answers[q.id]=i; renderExam();
    });
  });
}
async function playExam(){
  const e=state.exam,s=e.stimuli[e.idx];
  if(e.played[s.id]) return;
  e.played[s.id]=true; renderExam();
  await speakStimulus(s, els.examAudioStatus, 1);
  renderExam();
}
function examNext(){
  const e=state.exam,s=e.stimuli[e.idx];
  if(s.questions.some(q=>e.answers[q.id]==null) && !confirm("未回答があります。進みますか？")) return;
  if(e.idx<e.stimuli.length-1){e.idx++; renderExam(); return;}
  finishExam();
}
function finishExam(){
  const e=state.exam, map=qMap(e.year);
  let score=0,aMisses=0; const wrong=[];
  for(const [qid,item] of Object.entries(map)){
    const q=item.q, ans=e.answers[qid];
    if(ans===q.correct) score+=q.points;
    else{ wrong.push(qid); if(q.difficulty==="A") aMisses++; }
  }
  const record={date:new Date().toISOString(),score,aMisses,answers:e.answers,wrongQids:wrong,remediationComplete:wrong.length===0,causes:{},rediagnosis:{}, retakes:[]};
  state.progress.attempts[e.year] ||= {};
  if(!state.progress.attempts[e.year].initial){
    state.progress.attempts[e.year].initial=record;
    state.progress.history.unshift({year:e.year,date:record.date,score,aMisses,type:"initial"});
  }else{
    state.progress.attempts[e.year].retakes ||= [];
    state.progress.attempts[e.year].retakes.push(record);
  }
  saveProgress();
  if(!e.retake){
    els.initialScore.textContent=String(score);
    els.initialScoreRing.style.setProperty("--angle",`${score/20*360}deg`);
    els.initialScoreMessage.textContent=`${strategicLabel(score)}。A問題失点 ${aMisses}問。初回得点は今後も上書きしません。`;
    els.startRediagnosisBtn.textContent = wrong.length ? "間違いを再診断する" : "次へ進む";
    els.startRediagnosisBtn.dataset.noWrong = wrong.length ? "0" : "1";
    showView("scoreOnlyView");
  }else{
    toast(`再受験 ${score}/20。初回得点は保持されています。`);
    showView("dashboardView"); renderDashboard();
  }
}

// ---------- Rediagnosis ----------
function startRediagnosis(year){
  const att=getInitial(year); if(!att || !att.wrongQids.length){return;}
  const map=qMap(year), groups=[];
  const byStim={};
  att.wrongQids.forEach(qid=>{
    const item=map[qid]; if(!item)return;
    (byStim[item.stimulus.id] ||= {stimulus:item.stimulus,qids:[]}).qids.push(qid);
  });
  Object.values(byStim).forEach(x=>groups.push(x));
  state.rediagnosis={year,groups,idx:0,answers:{},played:{},revealed:false};
  showView("rediagnosisView"); renderRediagnosis();
}
function renderRediagnosis(){
  const r=state.rediagnosis,g=r.groups[r.idx],s=g.stimulus,map=qMap(r.year);
  els.rediagnosisProgress.textContent=`${r.idx+1} / ${r.groups.length}`;
  els.rediagnosisBar.style.width=`${(r.idx+1)/r.groups.length*100}%`;
  els.rediagnosisTitle.textContent=`${r.year}年度 大問${s.section} Number ${s.number}`;
  els.rediagnosisAudioStatus.textContent=r.played[s.id]?"再生済み":"正解はまだ非表示です";
  els.rediagnosisPlayBtn.disabled=!!r.played[s.id];
  els.rediagnosisPlayBtn.textContent=r.played[s.id]?"再生済み":"もう1回だけ聞く";
  els.rediagnosisResult.classList.add("hidden"); els.rediagnosisResult.innerHTML="";
  els.rediagnosisQuestions.innerHTML="";
  g.qids.forEach(qid=>{
    const q=map[qid].q, wrap=document.createElement("div"); wrap.className="question-block";
    const shownStem = s.section === 1 ? "Question（質問文は音声で読み上げ）" : esc(q.text);
    wrap.innerHTML=`<p class="question-text">${shownStem}</p><div class="cg"></div>`;
    els.rediagnosisQuestions.appendChild(wrap);
    renderChoiceGroup(wrap.querySelector(".cg"),q,r.answers[qid],i=>{r.answers[qid]=i;renderRediagnosis();});
  });
}
async function playRediagnosis(){
  const r=state.rediagnosis,g=r.groups[r.idx],s=g.stimulus;
  if(r.played[s.id])return;
  r.played[s.id]=true; renderRediagnosis();
  const map=qMap(r.year);
  const focused={...s,questions:g.qids.map(qid=>map[qid].q)};
  await speakStimulus(focused,els.rediagnosisAudioStatus,1); renderRediagnosis();
}
function submitRediagnosis(){
  const r=state.rediagnosis,g=r.groups[r.idx],map=qMap(r.year);
  if(g.qids.some(qid=>r.answers[qid]==null) && !confirm("未回答があります。確定しますか？")) return;
  const att=getInitial(r.year);
  g.qids.forEach(qid=>{
    att.rediagnosis[qid]={answer:r.answers[qid],correct:r.answers[qid]===map[qid].q.correct,date:new Date().toISOString()};
  });
  saveProgress();
  // Reveal only now.
  els.rediagnosisResult.classList.remove("hidden");
  els.rediagnosisResult.innerHTML=`<div class="feedback"><strong>再診断結果</strong>${g.qids.map(qid=>{
    const q=map[qid].q,ans=r.answers[qid],ok=ans===q.correct;
    return `<p>${ok?"○":"×"} ${esc(q.text)}<br>正解: ${KANA[q.correct]} ${esc(q.choices[q.correct])}</p>`;
  }).join("")}<button id="toScriptNow" class="primary" type="button">スクリプト練習へ</button></div>`;
  $("toScriptNow").addEventListener("click",()=>openScriptForCurrentGroup());
}
function openScriptForCurrentGroup(){
  const r=state.rediagnosis,g=r.groups[r.idx];
  state.script={year:r.year, groupIndex:r.idx, group:g, hidden:false,highlight:false};
  showView("scriptView"); renderScript();
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
  els.causePanel.innerHTML=g.qids.map(qid=>{
    const selected=att.causes?.[qid]||[];
    return `<div class="cause-group"><strong>${esc(map[qid].q.text)}</strong><div class="cause-buttons">${Object.entries(CAUSE_LABELS).map(([c,l])=>`<button class="cause-btn ${selected.includes(c)?"selected":""}" data-qid="${qid}" data-cause="${c}" type="button">${esc(l)}</button>`).join("")}</div></div>`;
  }).join("");
  els.causePanel.querySelectorAll(".cause-btn").forEach(b=>b.addEventListener("click",()=>{
    const qid=b.dataset.qid,c=b.dataset.cause;
    att.causes ||= {}; att.causes[qid] ||= [];
    const a=att.causes[qid],idx=a.indexOf(c); if(idx>=0)a.splice(idx,1);else a.push(c);
    saveProgress(); renderScript();
  }));
}
async function fullScriptReplay(){
  const sp=state.script,stim=sp.group.stimulus;
  await speakStimulus(stim,null,Number(els.practiceSpeed.value));
}
async function shadowCurrent(){
  const lines=scriptLines(state.script.group.stimulus);
  toast("各文の後に2秒空けます。声に出して追ってください。");
  for(const ln of lines){ await speak(ln.text,ln.role,Number(els.practiceSpeed.value)); await sleep(2000); }
}
function primaryDrillTags(){
  const sp=state.script,map=qMap(sp.year),tags=[];
  for(const qid of sp.group.qids){
    const qtags=map[qid].q.tags||[];
    // Prefer concrete first tag, but retain CHANGE when paired with time/money because it is diagnostically important.
    qtags.forEach(t=>{ if(!tags.includes(t)) tags.push(t); });
  }
  return tags.slice(0,2);
}
function startDrillsFromScript(){
  const existing=state.progress.pending;
  const tags=(existing?.type==="drill-sequence" && existing.year===state.script.year && existing.groupIndex===state.script.groupIndex)
    ? existing.tags : primaryDrillTags();
  const index=(existing?.type==="drill-sequence" && existing.year===state.script.year && existing.groupIndex===state.script.groupIndex)
    ? existing.index : 0;
  state.progress.pending={type:"drill-sequence",stage:"drill",year:state.script.year,groupIndex:state.script.groupIndex,tags,index};
  saveProgress();
  startDrill(tags[index]);
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
  state.drill={tag,items,idx:0,answers:[],correct:0,usedIds:[...used,...items.map(x=>x.id)],played:{},phase:extra?"extra":"initial",firstCorrect:extra?state.drill?.correct||0:0,firstTotal:extra?3:0};
  showView("drillView"); renderDrill();
}
function renderDrill(){
  const d=state.drill,it=d.items[d.idx];
  els.drillTagTitle.textContent=SKILL_LABELS[d.tag]||d.tag;
  els.drillProgress.textContent=`${d.idx+1} / ${d.items.length}`;
  els.drillBar.style.width=`${(d.idx+1)/d.items.length*100}%`;
  els.drillAudioStatus.textContent=d.played[it.id]?"再生済み":"1回で必要情報を拾う";
  els.drillPlayBtn.disabled=!!d.played[it.id];
  els.drillQuestion.textContent=it.question;
  renderChoiceGroup(els.drillChoices,it,d.answers[d.idx],i=>{d.answers[d.idx]=i;renderDrill();});
  els.drillFeedback.classList.add("hidden"); els.drillFeedback.innerHTML="";
  els.drillSubmitBtn.disabled=false;
}
async function playDrill(){
  const d=state.drill,it=d.items[d.idx]; if(d.played[it.id])return;
  d.played[it.id]=true; renderDrill();
  const stim={number:d.idx+1,kind:"short",turns:it.turns,questions:[{text:it.question}]};
  await speakStimulus(stim,els.drillAudioStatus,1); renderDrill();
}
function submitDrill(){
  const d=state.drill,it=d.items[d.idx],ans=d.answers[d.idx];
  if(ans==null){toast("回答を選んでください。");return;}
  const ok=ans===it.correct; if(ok)d.correct++;
  els.drillFeedback.classList.remove("hidden","ok","ng"); els.drillFeedback.classList.add(ok?"ok":"ng");
  els.drillFeedback.innerHTML=`<strong>${ok?"○ 正解":"× 不正解"}</strong><p>正解: ${KANA[it.correct]} ${esc(it.choices[it.correct])}</p><p>${esc(it.explanation)}</p><p class="small">【オリジナル類題】</p><button id="drillContinue" class="primary" type="button">${d.idx===d.items.length-1?"判定へ":"次の類題"}</button>`;
  els.drillSubmitBtn.disabled=true;
  $("drillContinue").addEventListener("click",advanceDrill);
}
function advanceDrill(){
  const d=state.drill;
  if(d.idx<d.items.length-1){d.idx++;renderDrill();return;}
  if(d.phase==="initial"){
    if(d.correct===3){ provisionalPass(d.tag,3,3); return; }
    if(d.correct===2){
      const tag=d.tag,used=d.usedIds,first=d.correct;
      const extras=chooseBankItems(tag,2,used);
      state.drill={tag,items:extras,idx:0,answers:[],correct:0,usedIds:[...used,...extras.map(x=>x.id)],played:{},phase:"extra",firstCorrect:first,firstTotal:3};
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
  state.progress.mastery[tag]={status:"provisional",due:addDaysISO(3),lastScore:`${correct}/${total}`,updated:new Date().toISOString()};
  saveProgress();
  const p=state.progress.pending;
  if(p?.type==="drill-sequence"){
    if(p.index<p.tags.length-1){ p.index++; saveProgress(); startDrill(p.tags[p.index]); return; }
    completeCurrentRemediationGroup();
  }else{
    showView("dashboardView"); renderDashboard();
  }
}
function failDrill(tag,correct,total){
  state.progress.mastery[tag]={status:"needs-practice",lastScore:`${correct}/${total}`,updated:new Date().toISOString()};
  if(state.progress.pending?.type==="drill-sequence") state.progress.pending.stage="script";
  saveProgress();
  alert(`${correct}/${total}でした。スクリプト練習に戻ります。`);
  if(state.script){showView("scriptView");renderScript();}else{restoreScriptFromPending();}
}
function completeCurrentRemediationGroup(){
  const p=state.progress.pending, r=state.rediagnosis;
  if(!p){showView("dashboardView");renderDashboard();return;}
  const att=getInitial(p.year);
  att.completedGroups ||= [];
  if(!att.completedGroups.includes(p.groupIndex)) att.completedGroups.push(p.groupIndex);
  if(r && r.year===p.year){
    if(r.idx<r.groups.length-1){ r.idx++; state.progress.pending=null; saveProgress(); showView("rediagnosisView"); renderRediagnosis(); return; }
  }
  // If no runtime r (resume after reload), recompute count.
  const totalGroups = buildWrongGroups(p.year).length;
  if((att.completedGroups||[]).length>=totalGroups){ att.remediationComplete=true; }
  state.progress.pending=null; saveProgress(); showView("dashboardView");renderDashboard();
}
function buildWrongGroups(year){
  const att=getInitial(year),map=qMap(year),by={};
  (att?.wrongQids||[]).forEach(qid=>{
    const item=map[qid];if(!item)return;(by[item.stimulus.id]||={stimulus:item.stimulus,qids:[]}).qids.push(qid);
  });
  return Object.values(by);
}
function resumeRemediation(year){
  const groups=buildWrongGroups(year),att=getInitial(year),done=new Set(att.completedGroups||[]);
  const idx=groups.findIndex((g,i)=>!done.has(i));
  state.rediagnosis={year,groups,idx:Math.max(0,idx),answers:{},played:{},revealed:false};
  showView("rediagnosisView");renderRediagnosis();
}

function restoreScriptFromPending(){
  const p=state.progress.pending;
  if(!p || p.type!=="drill-sequence"){showView("dashboardView");renderDashboard();return;}
  const groups=buildWrongGroups(p.year);
  const g=groups[p.groupIndex];
  if(!g){state.progress.pending=null;saveProgress();showView("dashboardView");renderDashboard();return;}
  state.rediagnosis={year:p.year,groups,idx:p.groupIndex,answers:{},played:{},revealed:true};
  state.script={year:p.year,groupIndex:p.groupIndex,group:g,hidden:false,highlight:false};
  showView("scriptView");renderScript();
}

// ---------- Retention ----------
function startRetention(tag){
  const item=chooseRetentionItem(tag);
  state.retention={tag,item,answer:null,played:false};
  showView("retentionView");renderRetention();
}
function renderRetention(){
  const r=state.retention,it=r.item;
  els.retentionTitle.textContent=`${SKILL_LABELS[r.tag]||r.tag} の定着確認`;
  els.retentionAudioStatus.textContent=r.played?"再生済み":"準備完了";
  els.retentionPlayBtn.disabled=r.played;
  els.retentionQuestion.textContent=it.question;
  renderChoiceGroup(els.retentionChoices,it,r.answer,i=>{r.answer=i;renderRetention();});
  els.retentionFeedback.classList.add("hidden");els.retentionFeedback.innerHTML="";
}
async function playRetention(){
  const r=state.retention;if(r.played)return;r.played=true;renderRetention();
  await speakStimulus({number:1,kind:"short",turns:r.item.turns,questions:[{text:r.item.question}]},els.retentionAudioStatus,1);renderRetention();
}
function submitRetention(){
  const r=state.retention;if(r.answer==null){toast("回答を選んでください。");return;}
  const ok=r.answer===r.item.correct;
  els.retentionFeedback.classList.remove("hidden","ok","ng");els.retentionFeedback.classList.add(ok?"ok":"ng");
  if(ok){
    state.progress.mastery[r.tag]={status:"mastered",updated:new Date().toISOString(),lastScore:"retention 1/1"};saveProgress();
    els.retentionFeedback.innerHTML=`<strong>○ 定着</strong><p>${esc(r.item.explanation)}</p><button id="retHome" class="primary" type="button">ダッシュボードへ</button>`;
    $("retHome").addEventListener("click",()=>{showView("dashboardView");renderDashboard();});
  }else{
    state.progress.mastery[r.tag]={status:"needs-practice",updated:new Date().toISOString(),lastScore:"retention 0/1"};saveProgress();
    els.retentionFeedback.innerHTML=`<strong>× もう一度補強</strong><p>正解: ${KANA[r.item.correct]} ${esc(r.item.choices[r.item.correct])}</p><p>${esc(r.item.explanation)}</p><button id="retDrill" class="primary" type="button">3問類題へ戻る</button>`;
    $("retDrill").addEventListener("click",()=>{state.progress.pending=null;startDrill(r.tag);});
  }
}

// ---------- History ----------
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
function bind(){
  els.todayStartBtn.addEventListener("click",()=>{
    const task=JSON.parse(els.todayStartBtn.dataset.task||"{}");
    if(task.type==="load-pack"){els.packInput.click();}
    else if(task.type==="exam")startExam(task.year);
    else if(task.type==="resume-remediation")resumeRemediation(task.year);
    else if(task.type==="resume-drill")startDrill(task.tag);
    else if(task.type==="resume-script")restoreScriptFromPending();
    else if(task.type==="retention")startRetention(task.tag);
  });
  els.dashboardBtn.addEventListener("click",()=>{window.speechSynthesis?.cancel();showView("dashboardView");renderDashboard();});
  els.historyBtn.addEventListener("click",()=>{renderHistory();showView("historyView");});
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
    if(confirm("初回得点・弱点・定着履歴をすべて消去しますか？")){
      state.progress=defaultProgress();saveProgress();renderDashboard();toast("進捗をリセットしました。");
    }
  });

  els.rateSlider.addEventListener("input",()=>{state.rate=Number(els.rateSlider.value);els.rateLabel.textContent=`${state.rate.toFixed(2)}×`;});
  [els.maleVoice,els.femaleVoice,els.narratorVoice].forEach(x=>x.addEventListener("change",syncVoices));
  els.voiceTestBtn.addEventListener("click",async()=>{await speak("I will meet you after school.","man");await speak("Great. I will see you then.","woman");await speak("Question. When will they meet?","narrator",.92);});

  els.examPlayBtn.addEventListener("click",playExam);els.examNextBtn.addEventListener("click",examNext);
  els.examQuitBtn.addEventListener("click",()=>{if(confirm("この年度の途中経過は保存されません。終了しますか？")){window.speechSynthesis?.cancel();showView("dashboardView");renderDashboard();}});
  els.startRediagnosisBtn.addEventListener("click",()=>{
    if(els.startRediagnosisBtn.dataset.noWrong === "1"){
      showView("dashboardView"); renderDashboard();
    }else{
      startRediagnosis(state.exam.year);
    }
  });
  els.scoreHomeBtn.addEventListener("click",()=>{showView("dashboardView");renderDashboard();});

  els.rediagnosisPlayBtn.addEventListener("click",playRediagnosis);els.rediagnosisSubmitBtn.addEventListener("click",submitRediagnosis);
  els.rediagnosisQuitBtn.addEventListener("click",()=>{showView("dashboardView");renderDashboard();});

  els.fullReplayBtn.addEventListener("click",fullScriptReplay);
  els.hideScriptBtn.addEventListener("click",()=>{state.script.hidden=!state.script.hidden;renderScript();});
  els.highlightBtn.addEventListener("click",()=>{state.script.highlight=!state.script.highlight;renderScript();});
  els.shadowBtn.addEventListener("click",shadowCurrent);els.startDrillBtn.addEventListener("click",startDrillsFromScript);

  els.drillPlayBtn.addEventListener("click",playDrill);els.drillSubmitBtn.addEventListener("click",submitDrill);
  els.drillQuitBtn.addEventListener("click",()=>{showView("dashboardView");renderDashboard();});

  els.retentionPlayBtn.addEventListener("click",playRetention);els.retentionSubmitBtn.addEventListener("click",submitRetention);

  els.historyCloseBtn.addEventListener("click",()=>{showView("dashboardView");renderDashboard();});
  // Header dashboard button doubles as return; long-press not needed.
  els.dashboardBtn.addEventListener("dblclick",()=>{renderHistory();showView("historyView");});

  window.addEventListener("beforeunload",()=>window.speechSynthesis?.cancel());
}
function cacheEls(){
  const ids=[
    "dashboardView","examView","scoreOnlyView","rediagnosisView","scriptView","drillView","retentionView","historyView",
    "dashboardBtn","historyBtn","todayTask","todayStartBtn","remainingDays","dataStatus","packInput","packInputLabel","forgetPackBtn","resetProgressBtn","roadmap","weaknessPanel","retentionPanel",
    "storageStatus","exportProgressBtn","progressImportInput",
    "rateSlider","rateLabel","maleVoice","femaleVoice","narratorVoice","voiceTestBtn","voiceStatus","toast",
    "examQuitBtn","examTitle","examProgressText","examProgressBar","examSectionLabel","examStimulusLabel","examAudioStatus","examPlayBtn","examQuestions","examNextBtn",
    "initialScoreRing","initialScore","initialScoreMessage","startRediagnosisBtn","scoreHomeBtn",
    "rediagnosisQuitBtn","rediagnosisProgress","rediagnosisBar","rediagnosisTitle","rediagnosisAudioStatus","rediagnosisPlayBtn","rediagnosisQuestions","rediagnosisSubmitBtn","rediagnosisResult",
    "scriptTitle","scriptSkillBadge","answerReveal","fullReplayBtn","hideScriptBtn","highlightBtn","shadowBtn","practiceSpeed","scriptText","causePanel","startDrillBtn",
    "drillQuitBtn","drillTagTitle","drillProgress","drillBar","drillAudioStatus","drillPlayBtn","drillQuestion","drillChoices","drillSubmitBtn","drillFeedback",
    "retentionTitle","retentionAudioStatus","retentionPlayBtn","retentionQuestion","retentionChoices","retentionSubmitBtn","retentionFeedback",
    "historyCloseBtn","historyTable"
  ];
  ids.forEach(id=>els[id]=$(id));
}
async function init(){
  cacheEls();
  if(!WS) throw new Error("storage.js を読み込めませんでした。");
  state.progress=loadProgress();bind();
  await tryAutoPack(); renderDashboard();
  loadVoices(); if(speechAvailable()){window.speechSynthesis.onvoiceschanged=loadVoices;setTimeout(loadVoices,400);setTimeout(loadVoices,1200);}
}
document.addEventListener("DOMContentLoaded",init);
})();
