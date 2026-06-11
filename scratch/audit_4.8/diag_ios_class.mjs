import { chromium, devices } from '@playwright/test';
const BASE='http://127.0.0.1:5073';
const b=await chromium.launch();
for (const [name, ua] of [['Android Chrome', devices['Pixel 5'].userAgent],['iPhone Safari', devices['iPhone 13'].userAgent]]) {
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ua});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex'})});localStorage.setItem('gg_auth_token','x');});
  await p.evaluate(()=>{window.location.hash='#home';}); await p.reload({waitUntil:'networkidle'}).catch(()=>{}); await p.waitForTimeout(1500);
  const hasIos=await p.evaluate(()=>document.documentElement.classList.contains('is-ios'));
  console.log(`${name}: html.is-ios = ${hasIos}`);
  await ctx.close();
}
await b.close();
