import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const USER = process.argv[2] || 'test:test-user-1';
const NAME = process.argv[3] || 'Alex Rivera';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const cerr=[]; p.on('console',m=>{ if(m.type()==='error') cerr.push(m.text()); });
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async({u,n})=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:u,name:n})});localStorage.setItem('gg_auth_token','x');},{u:USER,n:NAME});
await p.evaluate(()=>{location.hash='#settlement';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2500);

// Try to select the Lisbon trip if a selector exists
await p.screenshot({path:`scratch/audit_mk2/shots/p01_settle_initial.png`,fullPage:true}).catch(()=>{});

// Dump live state balances using the page's own modules if exposed
const dump = await p.evaluate(() => {
  const out = {};
  try {
    const w = window;
    // STATE is often attached for debugging; try common spots
    const STATE = w.STATE || (w.gg && w.gg.STATE) || null;
    out.hasState = !!STATE;
    if (STATE) {
      out.trips = (STATE.trips||[]).map(t=>({id:t.id,name:t.name,currency:t.currency,companions:t.companions}));
      out.expensesCount = (STATE.expenses||[]).length;
      out.settlements = STATE.settlements||[];
      out.currentTripId = STATE.currentTripId;
    }
  } catch(e){ out.err = String(e); }
  // also grab visible text of settlement area
  out.bodyText = document.body.innerText.slice(0, 4000);
  return out;
});
console.log('STATE present:', dump.hasState);
console.log('TRIPS:', JSON.stringify(dump.trips,null,1));
console.log('SETTLEMENTS:', JSON.stringify(dump.settlements,null,1));
console.log('currentTripId:', dump.currentTripId);
console.log('--- BODY TEXT (settlement) ---');
console.log(dump.bodyText);
console.log('pageerrors:', errs.length?errs:'none');
console.log('console errors:', cerr.length?cerr.slice(0,8):'none');
await ctx.close(); await b.close();
