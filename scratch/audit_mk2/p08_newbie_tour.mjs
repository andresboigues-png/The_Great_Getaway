import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5108';
const PREFIX='p08';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const cerr=[]; p.on('console',m=>{ if(m.type()==='error') cerr.push(m.text()); });

const shot = async (name) => { await p.screenshot({path:`scratch/audit_mk2/shots/${PREFIX}_${name}.png`,fullPage:true}).catch(()=>{}); };
const txt = async () => p.evaluate(()=>document.body.innerText.slice(0,3000));

// 1) LOGGED-OUT login wall (do NOT auth yet)
await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
await shot('00_loginwall_home');
console.log('=== LOGIN WALL (#home, logged out) ===');
console.log(await txt());

// Try other routes while logged out to see if wall is consistent
for (const route of ['expenses','friends','ai']){
  await p.evaluate((r)=>{location.hash='#'+r;},route);
  await p.waitForTimeout(800);
}
await shot('00b_loginwall_ai');
console.log('=== LOGIN WALL (#ai, logged out) ===');
console.log((await txt()).slice(0,800));

// 2) Now log in as FRESH EMPTY newbie-8
await p.evaluate(async()=>{
  const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:'test:test-newbie-8', name:'Liam Newbie'})});
  console.log('AUTH STATUS', r.status, (await r.text()).slice(0,120));
  localStorage.setItem('gg_auth_token','x');
});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2500);

// Walk every page empty state
const routes = ['home','todo','expenses','budgets','settlement','insights','feed','friends','collections','ai','search','settings'];
for (const r of routes){
  await p.evaluate((rt)=>{location.hash='#'+rt;},r);
  await p.waitForTimeout(1400);
  await shot(`10_${r}`);
  console.log(`\n========== PAGE: #${r} ==========`);
  console.log(await txt());
}

// Dump STATE to confirm we're truly empty
const dump = await p.evaluate(()=>{
  const w=window; const S=w.STATE||(w.gg&&w.gg.STATE)||null;
  if(!S) return {hasState:false};
  return {hasState:true, user:S.user?{name:S.user.name,id:S.user.id}:null,
    trips:(S.trips||[]).length, expenses:(S.expenses||[]).length,
    days:(S.tripDays||[]).length, budgets:(S.budgets||[]).length,
    guideProgress:S.guideProgress, hideQuickAccess:S.hideQuickAccess,
    categories:(S.categories||[]).map(c=>c.name||c.id)};
});
console.log('\n=== STATE DUMP (newbie-8) ===');
console.log(JSON.stringify(dump,null,1));
console.log('\npageerrors:', errs.length?errs:'none');
console.log('console errors:', cerr.length?[...new Set(cerr)].slice(0,12):'none');
await ctx.close(); await b.close();
