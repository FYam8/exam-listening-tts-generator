
global.window={};
require("./web/original_bank.js");
for(const x of window.LISTENING_ORIGINAL_BANK||[]){
  if((x.question||"").includes("probably say next")){
    console.log(x.question, x.id, x.correct, x.tag, x.retentionOnly, JSON.stringify(x.choices));
  }
}
