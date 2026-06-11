import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const reqs=[]; p.on('request',r=>{ if(r.url().includes('/api/settlements')||r.url().includes('/api/expenses')) reqs.push(`${r.method()} ${r.url().replace(BASE,'')}`);});
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#settlement';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);

// Click the first Settle button (Sara -> Alex $512.70)
const btns = await p.$$('.settle-debt-btn');
console.log('settle-debt buttons found:', btns.length);
for (const btn of btns) {
  const from = await btn.getAttribute('data-from');
  const to = await btn.getAttribute('data-to');
  const amt = await btn.getAttribute('data-amount');
  console.log(`  button: from=${from} to=${to} amount=${amt}`);
}
if (btns.length){
  await btns[0].click();
  await p.waitForTimeout(400);
  // a confirm/alert modal may appear; capture
  await p.screenshot({path:'scratch/audit_mk2/shots/p01_settle_click_after.png',fullPage:true}).catch(()=>{});
  // accept any confirm modal
  const confirmBtn = await p.$('.modal button.btn-primary, .modal .confirm, button:has-text("Settle")');
  const bodyText = await p.evaluate(()=>document.body.innerText);
  console.log('--- after click, looking for confirm ---');
  console.log(bodyText.slice(bodyText.indexOf('Settle')-50, bodyText.indexOf('Settle')+400));
}
await p.waitForTimeout(800);
console.log('network calls to settlements/expenses:', reqs);
console.log('pageerrors:', errs.length?errs:'none');
await ctx.close(); await b.close();
