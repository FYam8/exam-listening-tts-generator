(function(global){
  "use strict";
  const TARGETS=[60,70,75];
  function normalizeTarget(value){
    const n=Number(value);
    return TARGETS.includes(n)?n:70;
  }
  function goalLetter(target){
    target=normalizeTarget(target);
    return target===60?"A":target===70?"B":"C";
  }
  function goalLabel(target){
    target=normalizeTarget(target);
    return `${goalLetter(target)} ${target}点`;
  }
  function gradeInTarget(target,grade){
    target=normalizeTarget(target);
    const g=String(grade||"B").toUpperCase();
    return g==="A" || (g==="B" && target>=70) || (g==="C" && target>=75);
  }
  function gradeAdvice(target,grade){
    target=normalizeTarget(target);
    const g=String(grade||"B").toUpperCase();
    if(g==="A") return "60点ラインを守るため最優先";
    if(g==="B") return target>=70?"70点目標で必須補強":"60点を固めた後の上積み";
    return target>=75?"75点目標で選んで補強":"現在の目標では後回し";
  }
  function summary(target){
    target=normalizeTarget(target);
    if(target===60) return "A問題を必須補強にします。B・Cは初回記録と復習には残しますが、次年度へ進む条件にはしません。";
    if(target===70) return "A・B問題を必須補強にします。Cは初回記録と復習には残しますが、75点を狙う段階まで後回しにします。";
    return "A・Bを確実にしたうえで、C問題も必須補強に含めます。";
  }
  global.ListeningTargetStrategy={
    TARGETS,
    normalizeTarget,
    goalLetter,
    goalLabel,
    gradeInTarget,
    gradeAdvice,
    summary
  };
})(window);
