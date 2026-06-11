import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
// mobile viewport to stress nav/labels
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
// Alex is FR-persisted now
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
console.log('lang', await p.evaluate(()=>document.documentElement.lang));
// detect horizontal overflow / clipped text
const overflow = await p.evaluate(()=>{
  const docW=document.documentElement.clientWidth;
  const bad=[];
  document.querySelectorAll('button, a, .nav-item, .general-subtab, .theme-option-card__label, h1, h2, .btn-primary-pill').forEach(e=>{
    const r=e.getBoundingClientRect();
    if(r.width>0 && (r.right>docW+2 || e.scrollWidth>e.clientWidth+2)){
      bad.push({t:(e.innerText||'').slice(0,26).replace(/\n/g,' '), cls:e.className.toString().split(' ')[0], right:Math.round(r.right), docW, clip:e.scrollWidth>e.clientWidth+2});
    }
  });
  return {docW, bad:bad.slice(0,20)};
});
console.log('OVERFLOW/CLIP (mobile FR):', JSON.stringify(overflow,null,1));
await p.screenshot({path:'scratch/audit_mk2/shots/p10_fr_mobile_home.png'});
// open drawer on mobile, screenshot (long FR labels)
await p.locator('#hamburgerBtn').click().catch(()=>{});
await p.waitForTimeout(700);
await p.screenshot({path:'scratch/audit_mk2/shots/p10_fr_mobile_drawer.png'});
await b.close();
