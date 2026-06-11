import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const SIZES = {
  s360: { viewport:{width:360,height:640}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
  m390: { viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
  l430: { viewport:{width:430,height:932}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
};
// page -> a heading text we expect, to confirm the right page rendered before screenshot
const PAGES = [
  ['home', null],
  ['todo', 'To-do'],
  ['expenses', 'Expenses'],
  ['budgets', 'Budget'],
  ['settlement', 'Settle'],
  ['insights', 'Insight'],
  ['feed', 'Feed'],
  ['friends', 'Friend'],
  ['collections', 'Collection'],
  ['profile', 'Profile'],
  ['settings', 'Setting'],
];
const which = process.argv[2] || 'm390';
const cfg = SIZES[which];
const VW = cfg.viewport.width;
const b=await chromium.launch();
const ctx=await b.newContext(cfg);
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);

async function go(pg){
  // navigate by clicking via JS router-ish: set hash then dispatch
  await p.evaluate(x=>{ location.hash='#'+x; window.dispatchEvent(new HashChangeEvent('hashchange')); },pg);
  await p.waitForTimeout(1700);
}

for (const [pg, expect] of PAGES){
  await go(pg);
  // verify expected text is present in main
  let okText='(no-check)';
  if(expect){
    okText = await p.evaluate((t)=>{ const m=document.getElementById('app-container'); return m && m.innerText.includes(t); }, expect);
  }
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.waitForTimeout(150);
  await p.screenshot({path:`scratch/audit_mk2/shots/p06b_${which}_${pg}.png`}).catch(()=>{});
  const oc = await p.evaluate((vw)=>{
    const docW=document.documentElement.scrollWidth; const horiz=docW>vw+1;
    const offenders=[];
    if(horiz){ for(const el of document.querySelectorAll('#app-container *')){ const r=el.getBoundingClientRect(); if(r.right>vw+2&&r.width>20&&r.width<3000){ offenders.push((el.tagName.toLowerCase())+(el.id?'#'+el.id:'')+'@'+Math.round(r.right)); if(offenders.length>=5)break; } } }
    return { docW, horiz, offenders };
  }, VW);
  console.log(`[${which}|${pg}] gotExpectedText=${okText} horiz=${oc.horiz} docW=${oc.docW}/${VW}`, oc.horiz?JSON.stringify(oc.offenders):'');
}
console.log('SWEEP2 DONE', which);
await ctx.close(); await b.close();
