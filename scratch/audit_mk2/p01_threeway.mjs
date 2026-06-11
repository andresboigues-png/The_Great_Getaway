import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const dialogs=[]; // capture liquid alerts (they're DOM toasts, not native dialogs)
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#expenses';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);

// We need the Manual tab. Click it if present.
const manualTab = await p.$('[data-tab="manual"], button:has-text("Manual"), button:has-text("Add")');
// dump tab buttons
const tabs = await p.$$eval('button', bs=>bs.map(b=>b.textContent.trim()).filter(Boolean).slice(0,30));
console.log('buttons:', tabs);

// Add 3 splitters via the add-split-row select + Add button
async function addSplit(name){
  const sel = await p.$('.add-split-row select');
  if(!sel){ console.log('no split select found'); return false;}
  await sel.selectOption({label:name}).catch(async()=>{ await sel.selectOption(name).catch(()=>{}); });
  const addBtn = await p.$('.add-split-row button');
  if(addBtn) await addBtn.click();
  await p.waitForTimeout(300);
  return true;
}
// what companions are selectable?
const opts = await p.$$eval('.add-split-row select option', os=>os.map(o=>o.textContent.trim()));
console.log('split select options:', opts);

await addSplit('Alex');
await addSplit('Sara');
await addSplit('Tom');
await p.waitForTimeout(300);
// read the default pct values now in the inputs
const pcts = await p.$$eval('.split-input', is=>is.map(i=>({person:i.getAttribute('data-person'), val:i.value})));
console.log('split inputs after adding 3:', pcts);
const sum = pcts.reduce((s,x)=>s+ (parseFloat(x.val)||0), 0);
console.log('SUM of default 3-way split =', sum, '(needs ==100 within 0.01 to save)');
await p.screenshot({path:'scratch/audit_mk2/shots/p01_threeway_split.png',fullPage:true}).catch(()=>{});

console.log('pageerrors:', errs.length?errs:'none');
await ctx.close(); await b.close();
