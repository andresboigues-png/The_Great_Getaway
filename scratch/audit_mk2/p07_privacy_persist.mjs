import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5107';
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage();
const reqs=[];
p.on('requestfinished',async r=>{if(r.url().includes('/api/trips')&&r.method()==='POST'){const x=await r.response();reqs.push(`POST /api/trips ${x?.status()}`);}});
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
// Archive rome to have an archived card to toggle
await p.evaluate(()=>{location.hash='#collections';}); await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
async function rome(){return await p.evaluate(async()=>{const d=await(await fetch('/api/data')).json();const t=(d.trips||[]).find(x=>x.id==='p07-rome');return t?{isPublic:t.isPublic,showExp:t.publicShowExpenses}:'GONE';});}
console.log('rome before:', JSON.stringify(await rome()));
// change p07-rome privacy select to public-full
reqs.length=0;
const changed = await p.evaluate(()=>{
  const sel=document.querySelector('.trip-privacy-select[data-trip-id="p07-rome"]');
  if(!sel) return 'no select';
  sel.value='public-full'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  return 'changed to public-full';
});
console.log(changed);
await p.waitForTimeout(2000);
console.log('POST reqs:', JSON.stringify(reqs));
console.log('rome after change:', JSON.stringify(await rome()));
// hard reload, re-check
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
console.log('rome after reload:', JSON.stringify(await rome()));
await ctx.close(); await b.close();
