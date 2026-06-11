import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const cfg={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch();
const ctx=await b.newContext(cfg);
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
const tok = await p.evaluate(async()=>{ const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})}); const j=await r.json(); return j.token||j.access_token||null; });
await p.evaluate((t)=>{ localStorage.setItem('gg_auth_token','x'); window.__t=t; }, tok);
// Create a trip with a very long name via API
const longName='Aaaaa Bbbbb Ccccc Ddddd Eeeee Fffff Ggggg Hhhhh Iiiii Jjjjj Super Long Trip Name';
await p.evaluate(async({longName})=>{
  await fetch('/api/trips',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(window.__t||''),'Origin':location.origin},body:JSON.stringify({name:longName, location:'Nowhere', start_date:'2026-07-01', end_date:'2026-07-03'})}).catch(()=>{});
},{longName});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);
// Try to switch to the long-named trip if it exists in selector
await p.click('#mobileTripSwitcherBtn').catch(()=>{});
await p.waitForTimeout(400);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_longname_popover.png'});
// read the mobile header trip name element width/overflow
const hdr = await p.evaluate(()=>{
  // the trip name shown on home header
  const cand=[...document.querySelectorAll('#app-container h1, #app-container h2, #app-container [class*=trip]')].filter(e=>e.getBoundingClientRect().width>0);
  const info=cand.slice(0,6).map(e=>{ const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return { txt:(e.textContent||'').trim().slice(0,40), right:Math.round(r.right), w:Math.round(r.width), overflowsVp: r.right>390, whiteSpace:cs.whiteSpace, textOverflow:cs.textOverflow }; });
  return info;
});
console.log('header candidates:', JSON.stringify(hdr,null,1));
const docOverflow = await p.evaluate(()=>({ docW:document.documentElement.scrollWidth, vw:window.innerWidth, horiz: document.documentElement.scrollWidth>window.innerWidth+1 }));
console.log('doc overflow with long name:', JSON.stringify(docOverflow));
await p.keyboard.press('Escape').catch(()=>{});
await p.waitForTimeout(200);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_longname_home.png'});
await ctx.close(); await b.close();
