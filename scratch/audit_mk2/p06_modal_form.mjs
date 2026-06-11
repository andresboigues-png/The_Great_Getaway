import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const cfg={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch();
const ctx=await b.newContext(cfg);
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1600);

// open new trip modal
await p.click('#mobileTripSwitcherBtn').catch(()=>{});
await p.waitForTimeout(400);
await p.evaluate(()=>{ const b=document.getElementById('newTripBtn'); b&&b.click(); });
await p.waitForTimeout(700);

// Measure the ACTUAL sheet panel (child of overlay, not the overlay)
const sheet = await p.evaluate(()=>{
  const ov=document.querySelector('.modal-overlay');
  if(!ov) return {found:false};
  // the visible panel is the overlay's element child with a background
  let panel=null, best=0;
  for(const c of ov.querySelectorAll('*')){
    const cs=getComputedStyle(c); const r=c.getBoundingClientRect();
    const bg=cs.backgroundColor;
    if(r.height>120 && r.width>200 && bg && bg!=='rgba(0, 0, 0, 0)'){
      // pick the topmost-level sizable bg container (largest area but not the overlay)
      const area=r.width*r.height; if(area>best && c!==ov){ best=area; panel=c; }
    }
  }
  if(!panel) return {found:'no-panel'};
  const r=panel.getBoundingClientRect(); const cs=getComputedStyle(panel);
  return { cls:panel.className.slice(0,60), top:Math.round(r.top), bottom:Math.round(r.bottom), w:Math.round(r.width), vh:window.innerHeight,
    bottomAnchored: Math.abs(r.bottom-window.innerHeight)<3, hasTopGap: r.top>60, radiusTopL:cs.borderTopLeftRadius, radiusBotL:cs.borderBottomLeftRadius };
});
console.log('SHEET PANEL:', JSON.stringify(sheet));

// type into the name field and check focus + that content isn't lost behind keyboard
await p.fill('input', 'My Test Trip 🌴 with a very very long adventure name that keeps going');
await p.waitForTimeout(300);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_modal_typed.png'});
const fieldVal = await p.evaluate(()=>{ const i=document.querySelector('.modal-overlay input'); return i? i.value : null; });
console.log('typed value:', JSON.stringify(fieldVal));
// close
await p.click('.modal-overlay').catch(()=>{});

// ---------- swipe gesture functional test (real synthetic touch through the page) ----------
console.log('=== swipe gesture (home -> swipe left should go to To-do) ===');
await p.evaluate(()=>{ document.querySelectorAll('.modal-overlay').forEach(e=>e.remove()); location.hash='#home'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.waitForTimeout(900);
const before = await p.evaluate(()=>location.hash);
// swipe LEFT (next tab): finger goes right->left, on a non-map non-form area (the welcome heading region y~300)
const tp = await p.evaluateHandle(()=>document.body);
async function swipe(x1,y1,x2,y2){
  await p.evaluate(({x1,y1,x2,y2})=>{
    const mk=(id,x,y)=>new Touch({identifier:id,target:document.elementFromPoint(x,y)||document.body,clientX:x,clientY:y,pageX:x,pageY:y});
    const start=mk(1,x1,y1);
    document.dispatchEvent(new TouchEvent('touchstart',{cancelable:true,bubbles:true,touches:[start],targetTouches:[start],changedTouches:[start]}));
    const end=mk(1,x2,y2);
    document.dispatchEvent(new TouchEvent('touchend',{cancelable:true,bubbles:true,touches:[],targetTouches:[],changedTouches:[end]}));
  },{x1,y1,x2,y2});
}
await swipe(330,250,60,255); // strong left swipe (dx=-270)
await p.waitForTimeout(900);
const afterLeft = await p.evaluate(()=>location.hash);
console.log('swipe-left: before',before,'after',afterLeft, afterLeft!==before?'(navigated)':'(NO CHANGE)');
// now swipe RIGHT from wherever we are
await swipe(60,250,340,255); // dx=+280
await p.waitForTimeout(900);
const afterRight = await p.evaluate(()=>location.hash);
console.log('swipe-right: after',afterRight);
// swipe right from home -> opens drawer?
await p.evaluate(()=>{ location.hash='#home'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.waitForTimeout(700);
await swipe(40,250,330,255);
await p.waitForTimeout(600);
const drawerAfter = await p.evaluate(()=>({ open: !!document.getElementById('sidebar')?.classList.contains('open'), mainInert: document.getElementById('app-container')?.hasAttribute('inert') }));
console.log('swipe-right-from-home drawer:', JSON.stringify(drawerAfter));
await ctx.close(); await b.close();
