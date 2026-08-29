(() => {
  "use strict";

  const KANA = ["ア", "イ", "ウ", "エ", "オ", "カ"];
  const TAG_LABELS = {
    "next-response": "次の自然な発言",
    "final-decision": "最終決定",
    "information-update": "情報変更",
    "plan-change": "予定変更",
    "did-did-not": "した／しなかった",
    "place": "場所",
    "time": "時刻",
    "duration": "所要時間",
    "money": "金額",
    "quantity": "数量",
    "reason": "理由",
    "purpose": "目的",
    "detail": "内容一致",
    "main-idea": "要点"
  };

  const els = {};
  const state = {
    set: null,
    mode: "exam",
    index: 0,
    answers: {},
    played: {},
    speaking: false,
    finished: false,
    allReviewOpen: false,
    voices: [],
    selectedVoices: { male: null, female: null, narrator: null },
    rate: 1.0
  };

  function $(id) { return document.getElementById(id); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cacheElements() {
    [
      "homeView","quizView","resultView","historyView","historyButton","historyBackButton",
      "setTitle","setSubtitle","setStats","startButton","fileInput","localePreset","rateSlider",
      "rateValue","maleVoice","femaleVoice","narratorVoice","voiceTestButton","ttsSupport",
      "quitButton","progressText","modeBadge","progressBar","questionNumber","questionPrompt",
      "difficultyBadge","audioIcon","audioStatus","audioHint","playButton","choices","prevButton",
      "nextButton","inlineReview","scoreRing","scorePercent","scoreRaw","resultMessage","lineStatus",
      "difficultyResults","tagResults","questionResults","toggleAllReview","retryButton","homeButton",
      "historyList","clearHistoryButton","toast"
    ].forEach(id => els[id] = $(id));
  }

  function showView(name) {
    ["homeView","quizView","resultView","historyView"].forEach(id => {
      els[id].classList.toggle("hidden", id !== name);
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function validateSet(data) {
    if (!data || typeof data !== "object") throw new Error("JSONのトップレベルはオブジェクトにしてください。");
    if (!Array.isArray(data.questions) || !data.questions.length) throw new Error("questions がありません。");
    if (data.questions.length > 100) throw new Error("問題数は100問以下にしてください。");
    data.questions.forEach((q, i) => {
      if (!Array.isArray(q.dialogue) || !q.dialogue.length) throw new Error(`Question ${i + 1}: dialogue がありません。`);
      if (typeof q.question !== "string" || !q.question.trim()) throw new Error(`Question ${i + 1}: question がありません。`);
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) throw new Error(`Question ${i + 1}: choices は2〜6個にしてください。`);
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.choices.length) throw new Error(`Question ${i + 1}: correct は0始まりの選択肢番号にしてください。`);
      q.dialogue.forEach((turn, j) => {
        if (!["male","female","narrator","man","woman"].includes(String(turn.role).toLowerCase())) {
          throw new Error(`Question ${i + 1}, dialogue ${j + 1}: role は male / female / narrator にしてください。`);
        }
        if (typeof turn.text !== "string" || !turn.text.trim()) throw new Error(`Question ${i + 1}, dialogue ${j + 1}: text が空です。`);
      });
    });
    return data;
  }

  function normalizeSet(data) {
    const copy = structuredClone(data);
    copy.id = String(copy.id || `local-${Date.now()}`);
    copy.title = String(copy.title || "Local Listening Set");
    copy.subtitle = String(copy.subtitle || "");
    copy.questions = copy.questions.map((q, i) => ({
      id: String(q.id || `q${i + 1}`),
      number: Number(q.number || i + 1),
      dialogue: q.dialogue.map(turn => ({
        role: ({man:"male",woman:"female"}[String(turn.role).toLowerCase()] || String(turn.role).toLowerCase()),
        text: String(turn.text)
      })),
      question: String(q.question),
      choices: q.choices.map(String),
      correct: Number(q.correct),
      points: Number.isFinite(Number(q.points)) ? Number(q.points) : 1,
      difficulty: ["A","B","C"].includes(String(q.difficulty).toUpperCase()) ? String(q.difficulty).toUpperCase() : "A",
      tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
      review: {
        reason: String(q.review?.reason || ""),
        trap: String(q.review?.trap || ""),
        expressions: Array.isArray(q.review?.expressions) ? q.review.expressions.map(String) : []
      }
    }));
    return copy;
  }

  function setPracticeSet(data, fromLocal = false) {
    state.set = normalizeSet(validateSet(data));
    state.index = 0;
    state.answers = {};
    state.played = {};
    state.finished = false;
    els.setTitle.textContent = state.set.title;
    els.setSubtitle.textContent = state.set.subtitle || (fromLocal ? "ローカル教材" : "");
    const points = state.set.questions.reduce((s, q) => s + q.points, 0);
    const counts = state.set.questions.reduce((acc, q) => {
      acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
      return acc;
    }, {});
    els.setStats.innerHTML = `
      <span class="stat">${state.set.questions.length}問</span>
      <span class="stat">${points}点</span>
      <span class="stat">A ${counts.A || 0} / B ${counts.B || 0} / C ${counts.C || 0}</span>
      ${fromLocal ? '<span class="stat">ローカル読込</span>' : '<span class="stat">オリジナル類題</span>'}
    `;
  }

  // -----------------------
  // Speech synthesis
  // -----------------------
  function speechAvailable() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function loadVoices() {
    if (!speechAvailable()) {
      els.ttsSupport.textContent = "このブラウザはWeb Speech APIの音声合成に対応していません。";
      els.startButton.disabled = true;
      els.voiceTestButton.disabled = true;
      return;
    }
    const voices = window.speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    state.voices = voices;
    els.ttsSupport.textContent = voices.length
      ? `利用可能な英語音声: ${voices.length}件`
      : "英語音声を読み込み中です。数秒待ってから再度お試しください。";
    populateVoiceSelects();
  }

  function voiceLabel(v) {
    return `${v.name} (${v.lang})${v.localService ? " · local" : ""}`;
  }

  function populateVoiceSelects() {
    const current = {
      male: els.maleVoice.value,
      female: els.femaleVoice.value,
      narrator: els.narratorVoice.value
    };
    [els.maleVoice, els.femaleVoice, els.narratorVoice].forEach(sel => {
      sel.innerHTML = "";
      state.voices.forEach((v, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = voiceLabel(v);
        sel.appendChild(option);
      });
    });
    autoPickVoices();
    ["male","female","narrator"].forEach(role => {
      const sel = els[role + "Voice"];
      if (current[role] && sel.querySelector(`option[value="${CSS.escape(current[role])}"]`)) {
        sel.value = current[role];
      }
    });
    syncSelectedVoices();
  }

  function preferredVoices(locale) {
    return state.voices.filter(v => v.lang.toLowerCase().startsWith(locale.toLowerCase()));
  }

  function chooseByName(list, patterns, exclude = new Set()) {
    for (const pattern of patterns) {
      const found = list.find(v => pattern.test(v.name) && !exclude.has(v.name));
      if (found) return found;
    }
    return list.find(v => !exclude.has(v.name)) || list[0] || null;
  }

  function autoPickVoices() {
    if (!state.voices.length) return;
    const preset = els.localePreset.value;
    const us = preferredVoices("en-US");
    const uk = preferredVoices("en-GB");
    const all = state.voices;
    const malePatterns = [/guy/i,/david/i,/mark/i,/daniel/i,/ryan/i,/george/i,/male/i];
    const femalePatterns = [/jenny/i,/aria/i,/zira/i,/susan/i,/sonia/i,/libby/i,/samantha/i,/female/i];

    let malePool = preset === "uk" ? uk : us;
    let femalePool = preset === "us" ? us : uk;
    let narratorPool = preset === "uk" ? uk : us;
    if (!malePool.length) malePool = all;
    if (!femalePool.length) femalePool = all;
    if (!narratorPool.length) narratorPool = all;

    const used = new Set();
    const male = chooseByName(malePool, malePatterns, used); if (male) used.add(male.name);
    const female = chooseByName(femalePool, femalePatterns, used); if (female) used.add(female.name);
    const narrator = chooseByName(narratorPool, femalePatterns.concat(malePatterns), used) || female || male;

    const idx = v => Math.max(0, state.voices.indexOf(v));
    els.maleVoice.value = String(idx(male));
    els.femaleVoice.value = String(idx(female));
    els.narratorVoice.value = String(idx(narrator));
    syncSelectedVoices();
  }

  function syncSelectedVoices() {
    state.selectedVoices.male = state.voices[Number(els.maleVoice.value)] || null;
    state.selectedVoices.female = state.voices[Number(els.femaleVoice.value)] || null;
    state.selectedVoices.narrator = state.voices[Number(els.narratorVoice.value)] || null;
  }

  function utter(text, role, extraRate = 1) {
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = state.selectedVoices[role] || state.selectedVoices.narrator || state.voices[0];
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = role === "narrator" ? "en-US" : "en-US";
      }
      u.rate = clamp(state.rate * extraRate, .6, 1.4);
      u.pitch = role === "male" ? .95 : role === "female" ? 1.03 : 1.0;
      u.volume = 1;
      u.onend = () => resolve();
      u.onerror = e => {
        if (e.error === "canceled" || e.error === "interrupted") resolve();
        else reject(new Error(`音声合成エラー: ${e.error || "unknown"}`));
      };
      window.speechSynthesis.speak(u);
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function speakCurrentQuestion() {
    if (!speechAvailable() || state.speaking) return;
    const q = state.set.questions[state.index];
    if (state.mode === "exam" && state.played[q.id]) {
      toast("本番モードではこの問題の音声は再生済みです。");
      return;
    }

    state.speaking = true;
    state.played[q.id] = true;
    window.speechSynthesis.cancel();
    setAudioUI("playing");

    try {
      await utter(`Number ${q.number}.`, "narrator", .94);
      await wait(520);

      for (const turn of q.dialogue) {
        await utter(turn.text, turn.role, 1);
        await wait(260);
      }

      await wait(500);
      await utter(`Question. ${q.question}`, "narrator", .92);
      setAudioUI("done");
    } catch (err) {
      console.error(err);
      setAudioUI("error");
      toast(err.message || "音声を再生できませんでした。");
    } finally {
      state.speaking = false;
      renderPlayButton();
    }
  }

  function setAudioUI(status) {
    els.audioIcon.classList.toggle("playing", status === "playing");
    if (status === "playing") {
      els.audioIcon.textContent = "♪";
      els.audioStatus.textContent = "再生中";
      els.audioHint.textContent = "Number → 会話 → Question の順で流れます。";
      els.playButton.disabled = true;
    } else if (status === "done") {
      els.audioIcon.textContent = "✓";
      els.audioStatus.textContent = "再生終了";
      els.audioHint.textContent = state.mode === "exam" ? "回答を選んでください。" : "必要なら再生し直せます。";
    } else if (status === "error") {
      els.audioIcon.textContent = "!";
      els.audioStatus.textContent = "再生エラー";
      els.audioHint.textContent = "音声設定を確認してください。";
    } else {
      els.audioIcon.textContent = "▶";
      els.audioStatus.textContent = "準備完了";
      els.audioHint.textContent = "「音声を再生」を押してください。";
    }
  }

  function renderPlayButton() {
    const q = state.set.questions[state.index];
    const already = !!state.played[q.id];
    if (state.speaking) {
      els.playButton.disabled = true;
      els.playButton.textContent = "再生中…";
    } else if (state.mode === "exam" && already) {
      els.playButton.disabled = true;
      els.playButton.textContent = "再生済み";
    } else {
      els.playButton.disabled = false;
      els.playButton.textContent = already ? "もう一度再生" : "音声を再生";
    }
  }

  // -----------------------
  // Quiz
  // -----------------------
  function startQuiz() {
    if (!state.set) return;
    if (!speechAvailable()) {
      toast("このブラウザでは音声合成を利用できません。");
      return;
    }
    if (!state.voices.length) loadVoices();
    state.index = 0;
    state.answers = {};
    state.played = {};
    state.finished = false;
    state.allReviewOpen = false;
    showView("quizView");
    renderQuestion();
  }

  function currentQuestion() {
    return state.set.questions[state.index];
  }

  function renderQuestion() {
    window.speechSynthesis?.cancel();
    state.speaking = false;
    const q = currentQuestion();
    const total = state.set.questions.length;
    els.progressText.textContent = `Question ${state.index + 1} / ${total}`;
    els.progressBar.style.width = `${((state.index + 1) / total) * 100}%`;
    els.modeBadge.textContent = state.mode === "exam" ? "本番" : "復習";
    els.questionNumber.textContent = `Question ${q.number}`;
    els.questionPrompt.textContent = q.question;
    els.questionPrompt.classList.toggle("visually-hidden", state.mode === "exam");
    els.difficultyBadge.textContent = q.difficulty;
    els.prevButton.disabled = state.index === 0 || state.mode === "exam";
    els.nextButton.textContent = state.index === total - 1 ? "採点する" : "次へ";

    els.choices.innerHTML = "";
    q.choices.forEach((choiceText, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", state.answers[q.id] === i ? "true" : "false");
      if (state.answers[q.id] === i) button.classList.add("selected");
      button.innerHTML = `<span class="choice-label">${KANA[i] || i + 1}</span><span>${escapeHtml(choiceText)}</span>`;
      button.addEventListener("click", () => {
        if (state.speaking && state.mode === "exam") {
          // It is still okay to answer while audio is playing, as on paper.
        }
        state.answers[q.id] = i;
        renderChoicesOnly();
        if (state.mode === "review") renderInlineReview();
      });
      els.choices.appendChild(button);
    });

    setAudioUI(state.played[q.id] ? "done" : "ready");
    renderPlayButton();
    renderInlineReview();
  }

  function renderChoicesOnly() {
    const q = currentQuestion();
    [...els.choices.querySelectorAll(".choice")].forEach((button, i) => {
      const selected = state.answers[q.id] === i;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
      if (state.mode === "review" && selected) {
        button.classList.toggle("correct", i === q.correct);
        button.classList.toggle("incorrect", i !== q.correct);
      } else {
        button.classList.remove("correct", "incorrect");
      }
    });
  }

  function renderInlineReview() {
    const q = currentQuestion();
    if (state.mode !== "review" || state.answers[q.id] == null) {
      els.inlineReview.classList.add("hidden");
      els.inlineReview.innerHTML = "";
      return;
    }
    const user = state.answers[q.id];
    const ok = user === q.correct;
    els.inlineReview.classList.remove("hidden");
    els.inlineReview.innerHTML = `
      <strong>${ok ? "○ 正解" : "× 不正解"}</strong>
      <dl>
        <dt>正解</dt><dd>${KANA[q.correct]} ${escapeHtml(q.choices[q.correct])}</dd>
        <dt>根拠</dt><dd>${escapeHtml(q.review.reason || "—")}</dd>
        <dt>ひっかけ</dt><dd>${escapeHtml(q.review.trap || "—")}</dd>
        <dt>重要表現</dt><dd>${(q.review.expressions || []).map(escapeHtml).join(" / ") || "—"}</dd>
        <dt>分類</dt><dd>${escapeHtml(q.difficulty)}</dd>
      </dl>
    `;
    renderChoicesOnly();
  }

  function nextQuestion() {
    const q = currentQuestion();
    if (state.answers[q.id] == null) {
      if (!window.confirm("この問題は未回答です。未回答のまま進みますか？")) return;
    }
    if (state.index >= state.set.questions.length - 1) {
      finishQuiz();
      return;
    }
    state.index += 1;
    renderQuestion();
  }

  function prevQuestion() {
    if (state.mode === "exam" || state.index <= 0) return;
    state.index -= 1;
    renderQuestion();
  }

  function quitQuiz() {
    window.speechSynthesis?.cancel();
    state.speaking = false;
    if (window.confirm("この演習を終了してホームへ戻りますか？")) {
      showView("homeView");
    }
  }

  // -----------------------
  // Results / history
  // -----------------------
  function calculateResults() {
    const result = {
      correctCount: 0,
      totalCount: state.set.questions.length,
      score: 0,
      maxScore: 0,
      byDifficulty: {},
      byTag: {},
      items: []
    };

    state.set.questions.forEach(q => {
      const answer = state.answers[q.id];
      const ok = answer === q.correct;
      result.maxScore += q.points;
      if (ok) {
        result.correctCount += 1;
        result.score += q.points;
      }

      const d = result.byDifficulty[q.difficulty] ||= { correct: 0, total: 0 };
      d.total += 1;
      if (ok) d.correct += 1;

      q.tags.forEach(tag => {
        const t = result.byTag[tag] ||= { correct: 0, total: 0 };
        t.total += 1;
        if (ok) t.correct += 1;
      });

      result.items.push({ q, answer, ok });
    });
    result.percent = result.maxScore ? Math.round(result.score / result.maxScore * 100) : 0;
    return result;
  }

  function finishQuiz() {
    window.speechSynthesis?.cancel();
    state.speaking = false;
    state.finished = true;
    const result = calculateResults();
    saveHistory(result);
    renderResults(result);
    showView("resultView");
  }

  function resultMessage(result) {
    const a = result.byDifficulty.A;
    const aMisses = a ? a.total - a.correct : 0;
    if (aMisses > 0) return `A問題で${aMisses}問失点しています。まずAの取りこぼし修正を最優先に。`;
    if (result.percent >= 80) return "A問題は安定しています。B問題の精度を上げて上積みを狙えます。";
    if (result.percent >= 65) return "守る問題は取れています。B問題の情報変更・計算系を重点復習しましょう。";
    return "まずA問題を安定させ、1回で必要情報を拾う型を固めましょう。";
  }

  function renderResults(result) {
    els.scorePercent.textContent = `${result.percent}%`;
    els.scoreRaw.textContent = `${result.score} / ${result.maxScore}点`;
    els.scoreRing.style.setProperty("--score-angle", `${result.percent * 3.6}deg`);
    els.resultMessage.textContent = resultMessage(result);

    if (result.maxScore === 100) {
      els.lineStatus.classList.remove("hidden");
      els.lineStatus.innerHTML = [60,65,70,75].map(line =>
        `<span class="line-pill ${result.score >= line ? "reached" : ""}">${line}点 ${result.score >= line ? "✓" : ""}</span>`
      ).join("");
    } else {
      els.lineStatus.classList.add("hidden");
      els.lineStatus.innerHTML = "";
    }

    els.difficultyResults.innerHTML = ["A","B","C"].map(d => {
      const row = result.byDifficulty[d];
      if (!row) return "";
      const pct = Math.round(row.correct / row.total * 100);
      return `
        <div class="bar-item">
          <div class="bar-item-head"><span>${d}問題</span><span>${row.correct} / ${row.total}</span></div>
          <div class="mini-track"><div class="mini-bar" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join("");

    const tags = Object.entries(result.byTag).sort((a,b) => {
      const pa = a[1].correct / a[1].total;
      const pb = b[1].correct / b[1].total;
      return pa - pb || b[1].total - a[1].total;
    });
    els.tagResults.innerHTML = tags.length ? tags.map(([tag, row]) => `
      <span class="tag-chip">${escapeHtml(TAG_LABELS[tag] || tag)} <strong>${row.correct}/${row.total}</strong></span>
    `).join("") : '<p class="muted">タグデータはありません。</p>';

    els.questionResults.innerHTML = result.items.map(({q, answer, ok}, idx) => `
      <article class="result-item" data-result-index="${idx}">
        <div class="result-summary" role="button" tabindex="0" aria-expanded="false">
          <span class="result-mark ${ok ? "ok" : "ng"}">${ok ? "○" : "×"}</span>
          <span>Question ${q.number}</span>
          <span class="muted">${q.difficulty} · ${q.points}点</span>
        </div>
        <div class="result-detail">
          <dl class="detail-grid">
            <dt>あなたの回答</dt>
            <dd>${answer == null ? "未回答" : `${KANA[answer]} ${escapeHtml(q.choices[answer])}`}</dd>
            <dt>正解</dt>
            <dd>${KANA[q.correct]} ${escapeHtml(q.choices[q.correct])}</dd>
            <dt>Question</dt>
            <dd>${escapeHtml(q.question)}</dd>
            <dt>根拠</dt>
            <dd>${escapeHtml(q.review.reason || "—")}</dd>
            <dt>ひっかけ</dt>
            <dd>${escapeHtml(q.review.trap || "—")}</dd>
            <dt>重要表現</dt>
            <dd>${(q.review.expressions || []).map(escapeHtml).join(" / ") || "—"}</dd>
          </dl>
        </div>
      </article>
    `).join("");

    [...els.questionResults.querySelectorAll(".result-item")].forEach(item => {
      const summary = item.querySelector(".result-summary");
      const toggle = () => {
        const open = item.classList.toggle("open");
        summary.setAttribute("aria-expanded", open ? "true" : "false");
      };
      summary.addEventListener("click", toggle);
      summary.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  function historyKey() { return "waseshibu-listening-history-v1"; }

  function getHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(historyKey()) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }

  function saveHistory(result) {
    const history = getHistory();
    history.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: new Date().toISOString(),
      setId: state.set.id,
      title: state.set.title,
      mode: state.mode,
      score: result.score,
      maxScore: result.maxScore,
      percent: result.percent,
      correctCount: result.correctCount,
      totalCount: result.totalCount
    });
    localStorage.setItem(historyKey(), JSON.stringify(history.slice(0, 50)));
  }

  function renderHistory() {
    const history = getHistory();
    if (!history.length) {
      els.historyList.innerHTML = '<div class="empty-state">まだ学習履歴はありません。</div>';
      return;
    }
    els.historyList.innerHTML = `
      <table class="history-table">
        <thead><tr><th>日時</th><th>セット</th><th>モード</th><th>結果</th></tr></thead>
        <tbody>
          ${history.map(row => {
            const d = new Date(row.date);
            const dateText = Number.isNaN(d.getTime()) ? row.date : d.toLocaleString("ja-JP");
            return `<tr>
              <td>${escapeHtml(dateText)}</td>
              <td>${escapeHtml(row.title)}</td>
              <td>${row.mode === "exam" ? "本番" : "復習"}</td>
              <td><strong>${row.score}/${row.maxScore}点</strong> (${row.percent}%)</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  // -----------------------
  // Events
  // -----------------------
  function bindEvents() {
    document.querySelectorAll(".mode-card").forEach(button => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        document.querySelectorAll(".mode-card").forEach(b => {
          const selected = b === button;
          b.classList.toggle("selected", selected);
          b.setAttribute("aria-pressed", selected ? "true" : "false");
        });
      });
    });

    els.startButton.addEventListener("click", startQuiz);
    els.playButton.addEventListener("click", speakCurrentQuestion);
    els.nextButton.addEventListener("click", nextQuestion);
    els.prevButton.addEventListener("click", prevQuestion);
    els.quitButton.addEventListener("click", quitQuiz);

    els.rateSlider.addEventListener("input", () => {
      state.rate = Number(els.rateSlider.value);
      els.rateValue.textContent = `${state.rate.toFixed(2)}×`;
    });

    els.localePreset.addEventListener("change", autoPickVoices);
    [els.maleVoice, els.femaleVoice, els.narratorVoice].forEach(sel =>
      sel.addEventListener("change", syncSelectedVoices)
    );

    els.voiceTestButton.addEventListener("click", async () => {
      if (state.speaking) return;
      state.speaking = true;
      window.speechSynthesis.cancel();
      try {
        await utter("Man. I will meet you after school.", "male", 1);
        await wait(220);
        await utter("Woman. Great. I'll see you then.", "female", 1);
        await wait(220);
        await utter("Question. When will they meet?", "narrator", .92);
      } catch (err) {
        toast(err.message || "音声テストに失敗しました。");
      } finally {
        state.speaking = false;
      }
    });

    els.fileInput.addEventListener("change", async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error("JSONは2MB以下にしてください。");
        const data = JSON.parse(await file.text());
        setPracticeSet(data, true);
        toast("ローカルJSONを読み込みました。");
      } catch (err) {
        console.error(err);
        toast(err.message || "JSONを読み込めませんでした。");
      } finally {
        els.fileInput.value = "";
      }
    });

    els.retryButton.addEventListener("click", startQuiz);
    els.homeButton.addEventListener("click", () => showView("homeView"));

    els.toggleAllReview.addEventListener("click", () => {
      state.allReviewOpen = !state.allReviewOpen;
      [...els.questionResults.querySelectorAll(".result-item")].forEach(item => {
        item.classList.toggle("open", state.allReviewOpen);
        item.querySelector(".result-summary")?.setAttribute("aria-expanded", state.allReviewOpen ? "true" : "false");
      });
      els.toggleAllReview.textContent = state.allReviewOpen ? "すべて閉じる" : "すべて開く";
    });

    els.historyButton.addEventListener("click", () => {
      renderHistory();
      showView("historyView");
    });
    els.historyBackButton.addEventListener("click", () => showView("homeView"));
    els.clearHistoryButton.addEventListener("click", () => {
      if (window.confirm("学習履歴をすべて削除しますか？")) {
        localStorage.removeItem(historyKey());
        renderHistory();
        toast("履歴を削除しました。");
      }
    });

    window.addEventListener("beforeunload", () => window.speechSynthesis?.cancel());
  }

  async function init() {
    cacheElements();
    bindEvents();

    const fallback = window.WASESHIBU_DEFAULT_SET;
    try {
      // On GitHub Pages / local HTTP server, prefer the JSON file.
      const response = await fetch("data/demo.json", { cache: "no-store" });
      if (!response.ok) throw new Error("demo.json unavailable");
      setPracticeSet(await response.json(), false);
    } catch {
      // file:// blocks fetch in some browsers, so retain a working fallback.
      setPracticeSet(fallback, false);
    }

    loadVoices();
    if (speechAvailable()) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(loadVoices, 300);
      setTimeout(loadVoices, 1200);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
