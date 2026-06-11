import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5107';
const b=await chromium.launch();
async function trial(n){
  const ctx=await b.newContext(); const p=await ctx.newPage();
  let req=[];
  p.on('request',r=>{if(/\/(unarchive|archive)\b/.test(r.url()))req.push(r.method()+' '+r.url().split('/api')[1]);});
  p.on('requestfinished',async r=>{if(/\/(unarchive|archive)\b/.test(r.url())){const x=await r.response();req.push('DONE '+(x?x.status():'?'));}});
  p.on('requestfailed',r=>{if(/\/(unarchive|archive)\b/.test(r.url()))req.push('FAIL '+r.failure()?.errorText);});
  await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
  // ensure lisbon archived
  await p.evaluate(async()=>{await fetch('/api/trips/trip-lisbon/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});});
  await p.evaluate(()=>{location.hash='#collections';}); await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  req=[];
  const rb=await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]'); await rb.click(); await p.waitForTimeout(350);
  await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/^restore$/i.test((b.textContent||'').trim()));if(t)t.click();});
  await p.waitForTimeout(2500);
  const isA = await p.evaluate(async()=>{const d=await(await fetch('/api/data')).json();return (d.trips||[]).find(x=>x.id==='trip-lisbon')?.isArchived;});
  console.log(`trial ${n}: persisted=${isA===false?'YES':'NO (still archived)'} | net=${JSON.stringify(req)}`);
  await ctx.close();
}
for(let i=1;i<=5;i++) await trial(i);
await b.close();
