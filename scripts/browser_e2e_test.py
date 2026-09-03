
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, re, base64

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"

# Decode the bundled official-study pack only to drive deterministic E2E answers.
content_file=next(WEB.glob("content-*.js"))
content_text=content_file.read_text(encoding="utf-8")
b64=re.search(r'LISTENING_BUNDLED_PACK_B64="([^"]+)"',content_text).group(1)
PACK=json.loads(base64.b64decode(b64))
Y2023=next(y for y in PACK["years"] if y["year"]==2023)
STIMULI=Y2023["stimuli"]

SPEECH_STUB = r"""
<script>
(() => {
  const memStore=new Map();
  const fakeStorage={
    getItem(k){ return memStore.has(String(k))?memStore.get(String(k)):null; },
    setItem(k,v){ memStore.set(String(k),String(v)); },
    removeItem(k){ memStore.delete(String(k)); },
    clear(){ memStore.clear(); },
    key(i){ return [...memStore.keys()][i]??null; },
    get length(){ return memStore.size; }
  };
  try{ Object.defineProperty(window,"localStorage",{value:fakeStorage,configurable:true}); }catch{}
  const realSetTimeout=window.setTimeout.bind(window);
  window.setTimeout=(fn,ms,...args)=>realSetTimeout(fn,Math.min(Number(ms)||0,12),...args);
  class FakeUtterance {
    constructor(text){ this.text=String(text||""); this.rate=1; this.pitch=1; this.volume=1; this.lang="en-US"; this.voice=null; this.onstart=null; this.onend=null; this.onerror=null; }
  }
  const voices=[
    {name:"Fake Male",lang:"en-US",voiceURI:"fake-m",default:true,localService:true},
    {name:"Fake Female",lang:"en-US",voiceURI:"fake-f",default:false,localService:true}
  ];
  window.SpeechSynthesisUtterance=FakeUtterance;
  Object.defineProperty(window,"speechSynthesis",{value:{
    onvoiceschanged:null,
    getVoices(){ return voices; },
    cancel(){}, pause(){}, resume(){},
    speak(u){
      realSetTimeout(()=>{ if(typeof u.onstart==="function") u.onstart({utterance:u}); },1);
      realSetTimeout(()=>{ if(typeof u.onend==="function") u.onend({utterance:u}); },3);
    }
  },configurable:true});
})();
</script>
"""

def inline_html():
    html=(WEB/"index.html").read_text(encoding="utf-8")
    css=(WEB/"styles.css").read_text(encoding="utf-8")
    html=re.sub(r'<link[^>]+href="styles\.css(?:\?[^"]*)?"[^>]*>',"<style>"+css+"</style>",html)
    def repl(m):
        src=m.group(1).split("?")[0]
        p=WEB/src
        return "<script>\n"+p.read_text(encoding="utf-8")+"\n</script>" if p.exists() else m.group(0)
    html=re.sub(r'<script\s+src="([^"]+)"\s*></script>',repl,html)
    return html.replace("<head>","<head>"+SPEECH_STUB,1)

HTML=inline_html()

def visible(page,sel):
    return page.locator(sel).is_visible()

def assert_choices(page,view,container,minimum):
    assert visible(page,view),f"{view} not visible"
    n=page.locator(container+" .choice").count()
    assert n>=minimum,f"{view}: expected >= {minimum} choices, got {n}"
    return n

def play_until_ready(page,play_btn,ready_btn):
    page.locator(play_btn).click()
    page.wait_for_function("""sel => {
      const b=document.querySelector(sel); return b && !b.disabled;
    }""",arg=ready_btn,timeout=8000)
    page.wait_for_timeout(10)

def fresh_page(browser):
    ctx=browser.new_context()
    page=ctx.new_page()
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.set_content(HTML,wait_until="load")
    page.wait_for_timeout(80)
    assert page.locator("#buildBadge").inner_text().strip()=="Build v22 ✓"
    return ctx,page,errors

def choose_exam_answers(page,stimulus,make_wrong=False):
    blocks=page.locator("#examQuestions .exam-question-block")
    assert blocks.count()==len(stimulus["questions"])
    for qi,q in enumerate(stimulus["questions"]):
        idx=q["correct"]
        if make_wrong and qi==0:
            idx=(idx+1)%len(q["choices"])
        blocks.nth(qi).locator(".choice").nth(idx).click()

def choose_current_original_correct(page,retention=False):
    qtext=page.locator("#retentionQuestion" if retention else "#drillQuestion").inner_text()
    cont="#retentionChoices" if retention else "#drillChoices"
    choices=page.locator(cont+" .choice span:last-child").all_inner_texts()
    idx=page.evaluate("""({text,ret,choices}) => {
      const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
      const x=(window.LISTENING_ORIGINAL_BANK||[]).find(v=>
        v.question===text && !!v.retentionOnly===!!ret && same(v.choices,choices));
      return x ? x.correct : -1;
    }""",{"text":qtext,"ret":retention,"choices":choices})
    assert idx>=0,f"original-bank item not found: {qtext} / {choices}"
    page.locator(cont+" .choice").nth(idx).click()

def choose_current_transfer_correct(page):
    blocks=page.locator("#transferQuestions .transfer-question")
    for i in range(blocks.count()):
        qtext=blocks.nth(i).locator(".question-text").inner_text()
        idx=page.evaluate("""text => {
          for(const item of (window.LISTENING_TRANSFER_BANK||[])){
            const q=(item.questions||[]).find(v=>v.text===text);
            if(q) return q.correct;
          }
          return -1;
        }""",qtext)
        assert idx>=0,f"transfer question not found: {qtext}"
        blocks.nth(i).locator(".choice").nth(idx).click()

def finish_exam(page,target_index):
    page.locator("#todayStartBtn").click()
    page.wait_for_timeout(30)
    assert_choices(page,"#examView","#examQuestions",4)
    for si,stim in enumerate(STIMULI):
        progress=page.locator("#examProgressText").inner_text()
        assert progress.startswith(f"音声 {si+1}/{len(STIMULI)}・問題 "),progress
        assert page.locator("#examNextBtn").is_disabled(),"exam Next should start disabled"
        choose_exam_answers(page,stim,make_wrong=(si==target_index))
        assert page.locator("#examNextBtn").is_disabled(),"exam Next enabled without audio"
        play_until_ready(page,"#examPlayBtn","#examNextBtn")
        page.locator("#examNextBtn").click()
        page.wait_for_timeout(20)
    assert visible(page,"#scoreOnlyView")

def do_rediagnosis_and_script(page,target_index):
    page.locator("#startRediagnosisBtn").click()
    page.wait_for_timeout(25)
    assert_choices(page,"#rediagnosisView","#rediagnosisQuestions",4)
    q=STIMULI[target_index]["questions"][0]
    page.locator("#rediagnosisQuestions .choice").nth(q["correct"]).click()
    assert page.locator("#rediagnosisSubmitBtn").is_disabled(),"rediagnosis submit enabled without replay"
    play_until_ready(page,"#rediagnosisPlayBtn","#rediagnosisSubmitBtn")
    page.locator("#rediagnosisSubmitBtn").click()
    page.locator("#toScriptNow").click()
    page.wait_for_timeout(20)
    assert visible(page,"#scriptView")
    # Rediagnosis is correct, so cause input is optional.
    page.locator("#startDrillBtn").click()
    page.wait_for_timeout(20)
    assert visible(page,"#drillView")

def complete_level1(page):
    count=0
    while visible(page,"#drillView"):
        count+=1
        assert count<=6,"Level1 loop did not terminate"
        assert_choices(page,"#drillView","#drillChoices",2)
        assert page.locator("#drillSubmitBtn").is_disabled()
        choose_current_original_correct(page,False)
        assert page.locator("#drillSubmitBtn").is_disabled(),"Level1 submit enabled without audio"
        play_until_ready(page,"#drillPlayBtn","#drillSubmitBtn")
        page.locator("#drillSubmitBtn").click()
        result_text=page.locator("#drillFeedback > strong").inner_text()
        if not result_text.startswith("○"):
            raise AssertionError(f"Level1 intended-correct answer was scored wrong: {result_text}; question={page.locator('#drillQuestion').inner_text()}")
        assert page.locator("#drillFeedback .answer-transcript").is_visible(),"Level1 transcript missing after answer"
        assert page.locator("#drillFeedback .answer-transcript-line").count()>=1,"Level1 transcript has no lines"
        assert page.locator("#drillReplayAfterAnswer").is_visible(),"Level1 replay button missing after answer"
        page.locator("#drillReplayAfterAnswer").click()
        page.wait_for_function("""() => {
          const b=document.querySelector("#drillReplayAfterAnswer");
          return b && !b.disabled && /もう一度音声を再生/.test(b.textContent||"");
        }""",timeout=8000)
        page.locator("#drillContinue").click()
        page.wait_for_timeout(20)
    assert count>=3
    return count

def complete_transfer(page):
    count=0
    while visible(page,"#transferView"):
        count+=1
        assert count<=4,"transfer loop did not terminate"
        assert_choices(page,"#transferView","#transferQuestions",2)
        assert page.locator("#transferSubmitBtn").is_disabled()
        choose_current_transfer_correct(page)
        assert page.locator("#transferSubmitBtn").is_disabled(),"transfer submit enabled without audio"
        play_until_ready(page,"#transferPlayBtn","#transferSubmitBtn")
        page.locator("#transferSubmitBtn").click()
        assert page.locator("#transferFeedback .answer-transcript").is_visible(),"Transfer transcript missing after answer"
        assert page.locator("#transferFeedback .answer-transcript-line").count()>=1,"Transfer transcript has no lines"
        assert page.locator("#transferReplayAfterAnswer").is_visible(),"Transfer replay button missing after answer"
        page.locator("#transferReplayAfterAnswer").click()
        page.wait_for_function("""() => {
          const b=document.querySelector("#transferReplayAfterAnswer");
          return b && !b.disabled && /もう一度音声を再生/.test(b.textContent||"");
        }""",timeout=8000)
        page.locator("#transferContinue").click()
        page.wait_for_timeout(20)
    return count

def advance_four_days(page):
    page.evaluate("""() => {
      const RealDate=Date,offset=4*24*60*60*1000;
      window.Date=class extends RealDate{
        constructor(...args){ super(...(args.length?args:[RealDate.now()+offset])); }
        static now(){ return RealDate.now()+offset; }
      };
    }""")
    page.locator("#dashboardBtn").click()
    page.wait_for_timeout(20)

def scenario_b_transfer(browser,label):
    ctx,page,errors=fresh_page(browser)
    assert "2023" in page.locator("#todayTask").inner_text()
    finish_exam(page,3)  # 2023 大問1 Number 4: B / TIME+CHANGE
    do_rediagnosis_and_script(page,3)
    level1=complete_level1(page)
    assert visible(page,"#transferView"),"B/TIME source did not route to Level2"
    transfer=complete_transfer(page)
    assert transfer>=1
    assert visible(page,"#dashboardView"),"B transfer cycle did not return to dashboard"
    assert not errors,errors
    out={"scenario":"B-TIME-transfer","label":label,"level1_items":level1,"transfer_items":transfer,"errors":[]}
    ctx.close()
    return out

def scenario_a_retention(browser,label):
    ctx,page,errors=fresh_page(browser)
    finish_exam(page,0)  # 2023 Number 1: A / NEXT
    do_rediagnosis_and_script(page,0)
    level1=complete_level1(page)
    if not visible(page,"#dashboardView"):
        current=[v for v in ["#examView","#scoreOnlyView","#rediagnosisView","#scriptView","#drillView","#transferView","#retentionView","#dashboardView"] if visible(page,v)]
        raise AssertionError(f"A/NEXT expected dashboard after Level1; visible={current}; today={page.locator('#todayTask').inner_text() if page.locator('#todayTask').count() else ''}")
    advance_four_days(page)
    # After 4 days the due mini-retention should be the next task.
    assert "定着" in page.locator("#todayTask").inner_text(),page.locator("#todayTask").inner_text()
    page.locator("#todayStartBtn").click()
    page.wait_for_timeout(20)
    assert_choices(page,"#retentionView","#retentionChoices",2)
    assert page.locator("#retentionSubmitBtn").is_disabled()
    choose_current_original_correct(page,True)
    assert page.locator("#retentionSubmitBtn").is_disabled(),"retention submit enabled without audio"
    play_until_ready(page,"#retentionPlayBtn","#retentionSubmitBtn")
    page.locator("#retentionSubmitBtn").click()
    page.wait_for_timeout(20)
    assert "定着" in page.locator("#retentionFeedback").inner_text()
    assert page.locator("#retentionFeedback .answer-transcript").is_visible(),"Retention transcript missing after answer"
    assert page.locator("#retentionFeedback .answer-transcript-line").count()>=1,"Retention transcript has no lines"
    assert page.locator("#retentionReplayAfterAnswer").is_visible(),"Retention replay button missing after answer"
    page.locator("#retentionReplayAfterAnswer").click()
    page.wait_for_function("""() => {
      const b=document.querySelector("#retentionReplayAfterAnswer");
      return b && !b.disabled && /もう一度音声を再生/.test(b.textContent||"");
    }""",timeout=8000)
    assert not errors,errors
    out={"scenario":"A-NEXT-retention","label":label,"level1_items":level1,"retention":"ok","errors":[]}
    ctx.close()
    return out

with sync_playwright() as p:
    import os
    exe=os.environ.get("BROWSER_EXECUTABLE")
    if not exe and Path("/usr/bin/chromium").exists():
        exe="/usr/bin/chromium"
    kwargs={"headless":True,"args":["--no-sandbox"]}
    if exe: kwargs["executable_path"]=exe
    browser=p.chromium.launch(**kwargs)
    results=[]
    # Two complete independent E2E audit passes.
    for label in ["PASS-A","PASS-B"]:
        results.append(scenario_b_transfer(browser,label))
        results.append(scenario_a_retention(browser,label))
    browser.close()
print(json.dumps(results,ensure_ascii=False))
