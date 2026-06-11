import { chromium } from 'playwright';
const PORT=5105, BASE=`http://127.0.0.1:${PORT}`, SHOTS='scratch/audit_mk2/shots';
async function login(page,token,name){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ({token,name})=>{ await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name})}); localStorage.setItem('gg_auth_token','x'); },{token,name});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1500);
}
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
const page=await ctx.newPage();
await login(page,'test:test-user-1','Alex Rivera');
await page.evaluate(()=>{location.hash='#home';window.dispatchEvent(new HashChangeEvent('hashchange'));});
await page.waitForTimeout(1800);

// 1. Click the notification bell (top bar, has the count badge)
const bell = await page.$('button:has(svg) >> nth=0');
// More robust: find the element with the red badge "7"
await page.evaluate(()=>{
  const cands=[...document.querySelectorAll('button,[role="button"],a,div')];
  const bell=cands.find(e=>{ const aria=(e.getAttribute('aria-label')||'').toLowerCase(); return aria.includes('notif')||aria.includes('bell')|| (e.className||'').toString().toLowerCase().includes('notif'); });
  if(bell) bell.click();
});
await page.waitForTimeout(1500);
await page.screenshot({path:`${SHOTS}/p05_notif_dropdown.png`,fullPage:false});
const notifVisible = await page.evaluate(()=>!!document.querySelector('[class*="notif"][class*="dropdown"], [class*="notification"][class*="panel"], .notif-list, [class*="notif-item"]'));
console.log('notif dropdown visible:', notifVisible);

// 2. Open Companions tab on the Lisbon trip
await page.evaluate(()=>{location.hash='#home';window.dispatchEvent(new HashChangeEvent('hashchange'));});
await page.waitForTimeout(1500);
const compClicked = await page.evaluate(()=>{ const b=[...document.querySelectorAll('button,[role="tab"],a')].find(e=>(e.textContent||'').trim()==='Companions'); if(b){b.click();return true;} return false; });
await page.waitForTimeout(1800);
await page.screenshot({path:`${SHOTS}/p05_companions_tab.png`,fullPage:true});
console.log('companions tab clicked:', compClicked);

// dump companion-related DOM text
const compText = await page.evaluate(()=>{ const root=document.querySelector('[class*="companion"]')?.closest('section,div'); return (document.body.innerText.match(/Companion[\s\S]{0,600}/i)||[''])[0]; });
console.log('COMPANION AREA TEXT:\n', compText.slice(0,800));

await browser.close();
