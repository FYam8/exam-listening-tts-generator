
global.window={};
require("../web/original_bank.js");
const m=new Map();
for(const x of window.LISTENING_ORIGINAL_BANK||[]){
  const k=`${!!x.retentionOnly}|${x.question}`;
  if(!m.has(k))m.set(k,[]);
  m.get(k).push([x.id,x.correct,x.tag]);
}
for(const [k,v] of m) if(v.length>1) console.log(k,JSON.stringify(v));
