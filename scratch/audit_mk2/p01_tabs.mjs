import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#settlement';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);

async function clickTab(name){
  // tabs render as buttons with data-tab
  const sel = `.settle-tab[data-tab="${name}"]`;
  const el = await p.$(sel);
  if(el){ await el.click(); await p.waitForTimeout(900); }
  else { console.log('TAB BUTTON NOT FOUND for', name); }
}

// HISTORY
await clickTab('history');
await p.screenshot({path:`scratch/audit_mk2/shots/p01_tab_history.png`,fullPage:true}).catch(()=>{});
const histText = await p.evaluate(()=>document.querySelector('main')?.innerText || document.body.innerText);
console.log('=== HISTORY TAB TEXT ===');
console.log(histText.slice(0,1500));

// CROSS-TRIP
await clickTab('global');
await p.screenshot({path:`scratch/audit_mk2/shots/p01_tab_crosstrip.png`,fullPage:true}).catch(()=>{});
const crossText = await p.evaluate(()=>document.querySelector('main')?.innerText || document.body.innerText);
console.log('\n=== CROSS-TRIP TAB TEXT ===');
console.log(crossText.slice(0,1800));

console.log('\npageerrors:', errs.length?errs.slice(0,5):'none');
await ctx.close(); await b.close();
