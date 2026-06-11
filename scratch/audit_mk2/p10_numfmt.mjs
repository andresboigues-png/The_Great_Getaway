import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
// ensure FR persisted (Alex is fr now)
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1200);
console.log('locale html:', await p.evaluate(()=>document.documentElement.lang));
const grabMoney=async(hash)=>{
  await p.evaluate(h=>{location.hash='#'+h;},hash); await p.waitForTimeout(1600);
  const m=await p.evaluate(()=>{const t=document.body.innerText; return (t.match(/[€$£¥]\s?[\d.,]+|[\d.,]+\s?[€$£¥]|[\d.,]+\s?\$US|[\d.,]+\s?EUR/g)||[]).slice(0,12);});
  return m;
};
for(const h of ['expenses','budgets','settlement','insights']) console.log(h+':', JSON.stringify(await grabMoney(h)));
// also directly probe the formatters
const direct=await p.evaluate(()=>{
  try{
    return {
      intlFR: new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(970.62),
      intlEN: new Intl.NumberFormat('en-US',{style:'currency',currency:'EUR'}).format(970.62),
    };
  }catch(e){return {err:e.message};}
});
console.log('Intl probe:', JSON.stringify(direct));
await b.close();
