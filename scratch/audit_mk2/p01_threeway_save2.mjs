import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2,locale:'en-US'});
const p=await ctx.newPage();
const posts=[]; p.on('request',r=>{ if(r.method()==='POST'&&r.url().includes('/api/expenses')) posts.push(r.url());});
// intercept showLiquidAlert by capturing any toast added to DOM
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#expenses';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);
async function addSplit(name){ const sel=await p.$('.add-split-row select'); await sel.selectOption(name).catch(()=>{}); const btn=await p.$('.add-split-row button'); if(btn) await btn.click(); await p.waitForTimeout(250);}
await addSplit('Alex'); await addSplit('Sara'); await addSplit('Tom');
// Fill ALL fields. Find label input: the input directly under LABEL.
await p.evaluate(()=>{
  // value
  const nums=[...document.querySelectorAll('input[type="number"]')].filter(i=>!i.classList.contains('split-input'));
  if(nums[0]){ nums[0].value='30'; nums[0].dispatchEvent(new Event('input',{bubbles:true})); }
  // label: first text input
  const texts=[...document.querySelectorAll('input[type="text"]')];
  if(texts[0]){ texts[0].value='Dinner split 3 ways'; texts[0].dispatchEvent(new Event('input',{bubbles:true})); }
  // date
  const dates=[...document.querySelectorAll('input[type="date"]')];
  if(dates[0]){ dates[0].value='2026-05-30'; dates[0].dispatchEvent(new Event('input',{bubbles:true})); }
});
await p.waitForTimeout(300);
// hook the alert: override window function if exposed, else watch DOM text
await p.evaluate(()=>{ window.__alerts=[]; const orig=window.alert; window.alert=(m)=>{window.__alerts.push('native:'+m);}; });
const saveBtn = await p.$('button:has-text("Save Expense")');
await saveBtn.click();
await p.waitForTimeout(1500);
// scan for toast text
const toastTxt = await p.evaluate(()=>{
  const cand=[...document.querySelectorAll('[class*="alert"],[class*="toast"],[class*="liquid"],[role="alert"]')].map(e=>e.textContent.trim()).filter(t=>t&&t.length<200);
  return {toasts:cand.slice(0,5), native:window.__alerts};
});
console.log('toasts:', JSON.stringify(toastTxt));
console.log('POST /api/expenses fired?', posts.length? 'YES '+posts.length : 'NO (blocked)');
await p.screenshot({path:'scratch/audit_mk2/shots/p01_threeway_save2.png'}).catch(()=>{});
await ctx.close(); await b.close();
