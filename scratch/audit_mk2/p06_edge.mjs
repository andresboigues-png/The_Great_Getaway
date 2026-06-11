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

// ---- Budgets: find the 17px Delete buttons, screenshot scrolled ----
console.log('=== Budgets tiny Delete buttons ===');
await p.evaluate(()=>{ location.hash='#budgets'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.waitForTimeout(1500);
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await p.waitForTimeout(400);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_budgets_bottom.png'});
const delBtns = await p.evaluate(()=>{
  const out=[];
  for(const btn of document.querySelectorAll('#app-container button')){
    const t=(btn.textContent||'').trim();
    if(/delete/i.test(t)){ const r=btn.getBoundingClientRect(); out.push({ text:t, h:Math.round(r.height), w:Math.round(r.width), behindNav: r.bottom> (document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect().top ?? 9999) }); }
  }
  return out;
});
console.log('budget delete btns:', JSON.stringify(delBtns));

// ---- Expenses History list: last item hidden behind nav? ----
console.log('=== Expenses History — last item vs bottom nav ===');
await p.evaluate(()=>{ location.hash='#expenses'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.waitForTimeout(1500);
// click History tab
await p.evaluate(()=>{ const tabs=[...document.querySelectorAll('#app-container button, #app-container [role=tab], #app-container a')]; const h=tabs.find(t=>/^history$/i.test((t.textContent||'').trim())); h&&h.click(); });
await p.waitForTimeout(1200);
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await p.waitForTimeout(500);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_expenses_history_bottom.png'});
const lastItem = await p.evaluate(()=>{
  const nav=document.querySelector('.mobile-bottom-nav'); const navTop=nav?nav.getBoundingClientRect().top:9999;
  // find the last expense row/card
  const cards=[...document.querySelectorAll('#app-container [class*=expense], #app-container li, #app-container [class*=card]')].filter(e=>e.getBoundingClientRect().height>20);
  const last=cards[cards.length-1];
  if(!last) return {found:false, navTop};
  const r=last.getBoundingClientRect();
  return { found:true, lastBottom:Math.round(r.bottom), navTop:Math.round(navTop), hiddenBehindNav: r.bottom> navTop+2 && r.top<navTop, mainPadBottom: getComputedStyle(document.getElementById('app-container')).paddingBottom };
});
console.log('last history item vs nav:', JSON.stringify(lastItem));

// ---- Long trip name in header + selector ----
console.log('=== Long trip name handling ===');
await p.evaluate(()=>{ location.hash='#home'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.waitForTimeout(900);
const sel = await p.evaluate(()=>{ const s=document.getElementById('tripSelector'); if(!s) return null; const r=s.getBoundingClientRect(); const cs=getComputedStyle(s); return { maxW:cs.maxWidth, w:Math.round(r.width), overflow:cs.textOverflow }; });
console.log('trip selector style:', JSON.stringify(sel));
await ctx.close(); await b.close();
