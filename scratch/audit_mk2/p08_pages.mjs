import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5108';
const PREFIX='p08';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage();
const cerr=[]; p.on('console',m=>{ if(m.type()==='error') cerr.push(m.text()); });

await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
await p.evaluate(async()=>{
  await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:'test:test-newbie-8', name:'Liam Newbie'})});
  localStorage.setItem('gg_auth_token','x');
});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2000);

const routes = process.argv.slice(2);
const list = routes.length?routes:['home','todo','expenses','budgets','settlement','insights','feed','friends','collections','ai','search'];
for (const r of list){
  // Navigate, then force a reload so the route fully renders before we read.
  await p.evaluate((rt)=>{location.hash='#'+rt;},r);
  await p.waitForTimeout(400);
  await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(1800);
  // Strip the persistent nav chrome so the page text is clear.
  const main = await p.evaluate(()=>{
    const m=document.querySelector('main')||document.querySelector('#app')||document.body;
    return (m.innerText||'').replace(/\s*\n\s*\n+/g,'\n').slice(0,1800);
  });
  await p.screenshot({path:`scratch/audit_mk2/shots/${PREFIX}_pg_${r}.png`,fullPage:true}).catch(()=>{});
  console.log(`\n=========== #${r} ===========`);
  console.log(main);
}
console.log('\nconsole errors:', cerr.length?[...new Set(cerr)].slice(0,8):'none');
await ctx.close(); await b.close();
