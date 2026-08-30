(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ListeningStudyPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  const PASS_SCORE = 12;
  const STABLE_SCORE = 14;
  const STABLE_A_MISSES_MAX = 1;

  function strategicLabel(score){
    const value = Number(score) || 0;
    if(value >= 18) return "十分な余裕";
    if(value >= 14) return "安定目標達成";
    if(value >= 12) return "6割ライン到達";
    return "要補強";
  }

  function isStableAttempt(attempt, weaknessReady){
    return !!attempt
      && Number(attempt.score) >= STABLE_SCORE
      && Number(attempt.aMisses || 0) <= STABLE_A_MISSES_MAX
      && !!weaknessReady;
  }

  function dayOffset(dateText, todayText){
    const date = Date.parse(`${dateText || ""}T12:00:00Z`);
    const today = Date.parse(`${todayText || ""}T12:00:00Z`);
    if(!Number.isFinite(date) || !Number.isFinite(today)) return 0;
    return Math.max(0, Math.ceil((date - today) / 86400000));
  }

  function estimateRemaining(progress, years, todayText){
    const attempts = progress?.attempts || {};
    const mastery = progress?.mastery || {};
    const remainingYears = years.filter(year => !attempts?.[year]?.initial).length;
    const activeRemediation = years.filter(year => {
      const initial = attempts?.[year]?.initial;
      return initial && (initial.wrongQids || []).length && !initial.remediationComplete;
    }).length;

    const provisional = Object.values(mastery).filter(row => row?.status === "provisional");
    const needsPractice = Object.values(mastery).filter(row => row?.status === "needs-practice").length;

    // At a 14/20 stability target, a future past paper will usually need one correction day.
    const projectedRemediation = remainingYears;
    // Repeated tags overlap, so estimate only a small number of additional spaced checks.
    const projectedRetention = remainingYears
      ? Math.min(5, Math.max(2, Math.ceil(remainingYears * 0.6)))
      : 0;

    let taskDays = remainingYears + activeRemediation + projectedRemediation
      + provisional.length + needsPractice * 2 + projectedRetention;

    // Once no other work remains, a future due date can create genuine calendar waiting days.
    if(remainingYears === 0 && activeRemediation === 0 && provisional.length){
      const dueOffsets = provisional
        .map(row => dayOffset(row.due, todayText))
        .sort((a,b) => a-b);
      let calendarForRetention = 0;
      for(const offset of dueOffsets) calendarForRetention = Math.max(calendarForRetention + 1, offset);
      taskDays += Math.max(0, calendarForRetention - provisional.length);
    }

    if(taskDays === 0) return {min:0, max:0, remainingYears, activeRemediation};
    return {
      min:Math.max(1, taskDays - 2),
      max:taskDays + 2,
      remainingYears,
      activeRemediation
    };
  }

  return {
    PASS_SCORE,
    STABLE_SCORE,
    STABLE_A_MISSES_MAX,
    strategicLabel,
    isStableAttempt,
    estimateRemaining
  };
});
