import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
const p=await ctx.newPage();
const posts=[]; p.on('request',r=>{ if(r.method()==='POST'&&r.url().includes('/api/expenses')) posts.push(r.url());});
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#expenses';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);
async function addSplit(name){ const sel=await p.$('.add-split-row select'); await sel.selectOption(name).catch(()=>{}); const btn=await p.$('.add-split-row button'); if(btn) await btn.click(); await p.waitForTimeout(250);}
await addSplit('Alex'); await addSplit('Sara'); await addSplit('Tom');
// fill required fields: value + label + category if needed
const valInput = await p.$('input[type="number"]:not(.split-input)');
if(valInput) await valInput.fill('30');
// label
const labelInput = await p.$('input[placeholder*="hat"], input[name="label"], input[placeholder*="xpense"]');
if(labelInput) await labelInput.fill('Test 3way');
await p.waitForTimeout(200);
// click Save Expense
const saveBtn = await p.$('button:has-text("Save Expense")');
if(saveBtn) await saveBtn.click();
await p.waitForTimeout(1200);
// look for toast text
const toast = await p.evaluate(()=>{ const els=[...document.querySelectorAll('*')].filter(e=>/sum|100%|percent/i.test(e.textContent||'') && e.children.length===0); return els.slice(0,3).map(e=>e.textContent.trim()); });
console.log('toast/alert text matching sum/percent:', toast);
console.log('POST /api/expenses fired?', posts.length? posts : 'NO (save blocked)');
await p.screenshot({path:'scratch/audit_mk2/shots/p01_threeway_save.png',fullPage:true}).catch(()=>{});
await ctx.close(); await b.close();
