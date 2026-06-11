import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5107';
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:1000}}); const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(async()=>{await fetch('/api/trips/trip-lisbon/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});});
await p.evaluate(()=>{location.hash='#collections';}); await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1200);
const rb=await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]'); await rb.click(); await p.waitForTimeout(350);
await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/^restore$/i.test((b.textContent||'').trim()));if(t)t.click();});
await p.waitForTimeout(1500);
// Now on home, with lisbon "restored" locally. Check the trip selector shows lisbon as active option.
await p.screenshot({path:'scratch/audit_mk2/shots/p07_after_restore_home.png',fullPage:false});
// Go to expenses and screenshot to look for doubled rows
await p.evaluate(()=>{location.hash='#expenses';}); await p.waitForTimeout(1200);
await p.screenshot({path:'scratch/audit_mk2/shots/p07_after_restore_expenses.png',fullPage:true});
// Wait for a poll cycle (~15s) and see if lisbon vanishes back to archived
console.log('waiting 17s for poll...');
await p.waitForTimeout(17000);
await p.evaluate(()=>{location.hash='#collections';}); await p.waitForTimeout(1500);
const backInCollections = await p.evaluate(()=>!!document.querySelector('.archived-trip-card[data-trip-id="trip-lisbon"]'));
console.log('after 17s poll, lisbon back in collections (re-archived locally)?', backInCollections);
await p.screenshot({path:'scratch/audit_mk2/shots/p07_after_poll_collections.png',fullPage:true});
await ctx.close(); await b.close();
