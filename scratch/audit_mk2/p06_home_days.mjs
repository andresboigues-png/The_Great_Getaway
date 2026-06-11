import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const cfg={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch(); const ctx=await b.newContext(cfg); const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';}); await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1700);
// scroll down to the day cards / path
await p.evaluate(()=>window.scrollTo(0,650)); await p.waitForTimeout(500);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_home_days1.png'});
await p.evaluate(()=>window.scrollTo(0,1200)); await p.waitForTimeout(500);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_home_days2.png'});
await ctx.close(); await b.close();
