import { chromium } from 'playwright';
const PORT=5105, BASE=`http://127.0.0.1:${PORT}`, SHOTS='scratch/audit_mk2/shots';
async function login(page,token,name){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ({token,name})=>{ await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name})}); localStorage.setItem('gg_auth_token','x'); },{token,name});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1800);
}
const browser=await chromium.launch();
const page=await (await browser.newContext({viewport:{width:1280,height:1000}})).newPage();
await login(page,'test:test-user-1','Alex Rivera');
await page.evaluate(()=>{location.hash='#home';window.dispatchEvent(new HashChangeEvent('hashchange'));});
await page.waitForTimeout(1800);
await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,[role="tab"]')].find(e=>(e.textContent||'').trim()==='Companions'); if(b)b.click(); });
await page.waitForTimeout(1500);
const info = await page.evaluate(()=>{
  const countEl=document.querySelector('.trip-companions-card__count');
  const subtitle=document.querySelector('.trip-companions-card__subtitle');
  const chips=[...document.querySelectorAll('[class*="companion-chip"], .trip-companions-card [class*="chip"]')].map(c=>c.textContent.trim());
  // also grab raw STATE
  return { countBadge: countEl?.textContent, subtitle: subtitle?.textContent, chipCount: chips.length, chips };
});
console.log('CARD COUNT BADGE:', info.countBadge);
console.log('CARD SUBTITLE:', info.subtitle);
console.log('CHIPS RENDERED:', info.chipCount, JSON.stringify(info.chips));
// dump the in-memory trip companions/members
const st = await page.evaluate(()=>{
  const w = window;
  // find STATE via module — fallback to fetching /api/data
  return fetch('/api/data').then(r=>r.json()).then(d=>{ const t=d.trips.find(x=>x.id==='trip-lisbon'); return {members:(t.members||[]).map(m=>m.name), companions:(t.companions||[]).map(c=>c.name), myRole:t.myRole, ownerId:t.ownerId}; });
});
console.log('DATA members:', JSON.stringify(st.members), 'companions:', JSON.stringify(st.companions), 'myRole:', st.myRole);
await browser.close();
