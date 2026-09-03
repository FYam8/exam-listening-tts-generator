
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, re, base64, os

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"

content_file=next(WEB.glob("content-*.js"))
content_text=content_file.read_text(encoding="utf-8")
b64=re.search(r'LISTENING_BUNDLED_PACK_B64="([^"]+)"',content_text).group(1)
PACK=json.loads(base64.b64decode(b64))
Y2023=next(y for y in PACK["years"] if y["year"]==2023)
STIMULI=Y2023["stimuli"]

SPEECH_STUB=r"""
<script>
(() => {
  const memStore=new Map();
  const fakeStorage={
    getItem(k){return memStore.has(String(k))?memStore.get(String(k)):null;},
    setItem(k,v){memStore.set(String(k),String(v));},
    removeItem(k){memStore.delete(String(k));},clear(){memStore.clear();},
    key(i){return [...memStore.keys()][i]??null;},get length(){return memStore.size;}
  };
  try{Object.defineProperty(window,"localStorage",{value:fakeStorage,configurable:true});}catch{}
  const realSetTimeout=window.setTimeout.bind(window);
  window.setTimeout=(fn,ms,...args)=>realSetTimeout(fn,Math.min(Number(ms)||0,12),...args);
  class U{constructor(t){this.text=t;this.onstart=null;this.onend=null;this.onerror=null;}}
  window.SpeechSynthesisUtterance=U;
  Object.defineProperty(window,"speechSynthesis",{value:{
    getVoices(){return [{name:"Fake",lang:"en-US",voiceURI:"f",default:true,localService:true}]},
    cancel(){},pause(){},resume(){},
    speak(u){
      realSetTimeout(()=>u.onstart&&u.onstart({}),1);
      realSetTimeout(()=>u.onend&&u.onend({}),3);
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
        return "<script>"+p.read_text(encoding="utf-8")+"</script>" if p.exists() else m.group(0)
    html=re.sub(r'<script\s+src="([^"]+)"\s*></script>',repl,html)
    return html.replace("<head>","<head>"+SPEECH_STUB,1)

HTML=inline_html()

def visible(page,sel):
    return page.locator(sel).is_visible()

def wait_ready(page,play_btn,ready_btn):
    page.locator(play_btn).click()
    page.wait_for_function("sel=>{const b=document.querySelector(sel);return b && !b.disabled}",arg=ready_btn,timeout=8000)
    page.wait_for_timeout(10)

def assert_choices(page,view,container,minimum):
    assert visible(page,view),f"{view} not visible"
    n=page.locator(container+" .choice").count()
    assert n>=minimum,f"{view}: expected >= {minimum} choices, got {n}"
    return n

def make_page(browser):
    ctx=browser.new_context(viewport={"width":390,"height":844})
    page=ctx.new_page()
    errors=[]; logs=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.on("console",lambda m: logs.append(m.text) if m.type=="error" else None)
    page.set_content(HTML,wait_until="load")
    page.wait_for_timeout(80)
    return ctx,page,errors,logs

def choose_exam(page,stim,wrong=False):
    blocks=page.locator("#examQuestions .exam-question-block")
    assert blocks.count()==len(stim["questions"])
    for qi,q in enumerate(stim["questions"]):
        idx=q["correct"]
        if wrong and qi==0:
            idx=(idx+1)%len(q["choices"])
        blocks.nth(qi).locator(".choice").nth(idx).click()

def choose_original_correct(page,ret=False):
    qsel="#retentionQuestion" if ret else "#drillQuestion"
    csel="#retentionChoices" if ret else "#drillChoices"
    text=page.locator(qsel).inner_text()
    choices=page.locator(csel+" .choice span:last-child").all_inner_texts()
    idx=page.evaluate("""({text,ret,choices}) => {
      const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
      const x=(window.LISTENING_ORIGINAL_BANK||[]).find(v=>v.question===text && !!v.retentionOnly===!!ret && same(v.choices,choices));
      return x?x.correct:-1;
    }""",{"text":text,"ret":ret,"choices":choices})
    assert idx>=0
    page.locator(csel+" .choice").nth(idx).click()

def choose_transfer_correct(page):
    blocks=page.locator("#transferQuestions .transfer-question")
    for i in range(blocks.count()):
        qtext=blocks.nth(i).locator(".question-text").inner_text()
        idx=page.evaluate("""text=>{
          for(const item of (window.LISTENING_TRANSFER_BANK||[])){
            const q=(item.questions||[]).find(v=>v.text===text);
            if(q) return q.correct;
          }
          return -1;
        }""",qtext)
        assert idx>=0
        blocks.nth(i).locator(".choice").nth(idx).click()

def user_pass(browser,label):
    ctx,page,errors,logs=make_page(browser)
    out={"label":label}

    # Fresh user.
    assert page.locator("#buildBadge").inner_text().strip()=="Build v22 ✓"
    assert visible(page,"#dashboardView")
    assert page.locator("#todayStartBtn").inner_text().strip()=="今日の学習を始める"
    assert "2023年度で初回診断" in page.locator("#todayTask").inner_text()

    # First problem.
    page.locator("#todayStartBtn").click(); page.wait_for_timeout(20)
    assert_choices(page,"#examView","#examQuestions",4)
    assert page.locator("#examTitle").inner_text().strip()=="2023年度 リスニング"
    assert page.locator("#examStimulusLabel").inner_text().strip()=="Number 1"
    assert page.locator("#examNextBtn").is_disabled()

    # Choose answer before audio: cannot advance.
    choose_exam(page,STIMULI[0],wrong=True)
    assert page.locator("#examNextBtn").is_disabled()

    # Quit/resume exact state.
    page.locator("#examQuitBtn").click(); page.wait_for_timeout(10)
    assert visible(page,"#dashboardView")
    assert page.locator("#todayStartBtn").inner_text().strip()=="続きから次へ進む"
    assert "Number 1から続ける" in page.locator("#todayTask").inner_text()
    page.locator("#todayStartBtn").click(); page.wait_for_timeout(10)
    assert page.locator("#examStimulusLabel").inner_text().strip()=="Number 1"
    assert page.locator("#examQuestions .choice.selected").count()>=1
    assert page.locator("#examNextBtn").is_disabled()

    # Finish Number 1 and exact Number 2 dashboard resume.
    wait_ready(page,"#examPlayBtn","#examNextBtn")
    page.locator("#examNextBtn").click(); page.wait_for_timeout(10)
    assert page.locator("#examStimulusLabel").inner_text().strip()=="Number 2"
    page.locator("#dashboardBtn").click(); page.wait_for_timeout(10)
    assert "Number 2から続ける" in page.locator("#todayTask").inner_text()
    page.locator("#todayStartBtn").click(); page.wait_for_timeout(10)
    assert page.locator("#examStimulusLabel").inner_text().strip()=="Number 2"

    # Complete rest of exam; only Number1 is wrong.
    for si in range(1,len(STIMULI)):
        stim=STIMULI[si]
        assert page.locator("#examStimulusLabel").inner_text().strip()==f"Number {stim['number']}"
        choose_exam(page,stim,wrong=False)
        assert page.locator("#examNextBtn").is_disabled()
        wait_ready(page,"#examPlayBtn","#examNextBtn")
        page.locator("#examNextBtn").click(); page.wait_for_timeout(10)
    assert visible(page,"#scoreOnlyView")

    # Rediagnosis -> script -> Level1.
    page.locator("#startRediagnosisBtn").click(); page.wait_for_timeout(10)
    assert_choices(page,"#rediagnosisView","#rediagnosisQuestions",4)
    q=STIMULI[0]["questions"][0]
    page.locator("#rediagnosisQuestions .choice").nth(q["correct"]).click()
    assert page.locator("#rediagnosisSubmitBtn").is_disabled()
    wait_ready(page,"#rediagnosisPlayBtn","#rediagnosisSubmitBtn")
    page.locator("#rediagnosisSubmitBtn").click(); page.wait_for_timeout(10)
    page.locator("#toScriptNow").click(); page.wait_for_timeout(10)
    assert visible(page,"#scriptView")
    page.locator("#startDrillBtn").click(); page.wait_for_timeout(10)

    l1=0
    while visible(page,"#drillView"):
        l1+=1
        assert l1<=6
        assert_choices(page,"#drillView","#drillChoices",2)
        choose_original_correct(page,False)
        assert page.locator("#drillSubmitBtn").is_disabled()
        wait_ready(page,"#drillPlayBtn","#drillSubmitBtn")
        page.locator("#drillSubmitBtn").click(); page.wait_for_timeout(5)
        assert page.locator("#drillFeedback > strong").inner_text().startswith("○")
        page.locator("#drillContinue").click(); page.wait_for_timeout(10)

    # After A/NEXT should return to dashboard.
    assert visible(page,"#dashboardView")

    # Advance time and do retention.
    page.evaluate("""() => {
      const RealDate=Date,offset=4*24*60*60*1000;
      window.Date=class extends RealDate{
        constructor(...args){ super(...(args.length?args:[RealDate.now()+offset])); }
        static now(){ return RealDate.now()+offset; }
      };
    }""")
    page.locator("#dashboardBtn").click(); page.wait_for_timeout(10)
    assert "定着" in page.locator("#todayTask").inner_text()
    page.locator("#todayStartBtn").click(); page.wait_for_timeout(10)
    assert_choices(page,"#retentionView","#retentionChoices",2)
    choose_original_correct(page,True)
    assert page.locator("#retentionSubmitBtn").is_disabled()
    wait_ready(page,"#retentionPlayBtn","#retentionSubmitBtn")
    page.locator("#retentionSubmitBtn").click(); page.wait_for_timeout(10)
    assert page.locator("#retentionFeedback").inner_text().strip()

    assert not errors,errors
    assert not logs,logs
    out.update({"level1_items":l1,"retention":"ok","page_errors":0,"console_errors":0})
    ctx.close()
    return out

with sync_playwright() as p:
    exe=os.environ.get("BROWSER_EXECUTABLE")
    if not exe and Path("/usr/bin/chromium").exists(): exe="/usr/bin/chromium"
    kw={"headless":True,"args":["--no-sandbox"]}
    if exe: kw["executable_path"]=exe
    browser=p.chromium.launch(**kw)
    results=[user_pass(browser,"USER-PASS-1"),user_pass(browser,"USER-PASS-2")]
    browser.close()
print(json.dumps(results,ensure_ascii=False))
