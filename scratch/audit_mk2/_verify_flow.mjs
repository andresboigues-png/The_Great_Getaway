import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
for (const h of ['home','expenses','budgets','settlement','insights']) {
  await p.evaluate(x=>{location.hash='#'+x;},h); await p.reload({waitUntil:'networkidle'}).catch(()=>{}); await p.waitForTimeout(1500);
  await p.screenshot({path:`scratch/audit_mk2/shots/_verify_${h}.png`}).catch(()=>{});
}
console.log('VERIFY DONE. pageerrors:', errs.length?errs.slice(0,3):'none');
await ctx.close(); await b.close();
