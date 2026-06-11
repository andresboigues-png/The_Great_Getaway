import { chromium } from 'playwright';
const PORT=5105, BASE=`http://127.0.0.1:${PORT}`;
async function login(page,token,name){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ({token,name})=>{ await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name})}); localStorage.setItem('gg_auth_token','x'); },{token,name});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1800);
}
const browser=await chromium.launch();
const page=await (await browser.newContext({viewport:{width:1280,height:1000}})).newPage();
await login(page,'test:test-user-1','Alex Rivera');
await page.evaluate(()=>{location.hash='#home';window.dispatchEvent(new HashChangeEvent('hashchange'));});
await page.waitForTimeout(2000);
// Try to reach STATE.trips via the global app state. Inspect window for it.
const dump = await page.evaluate(()=>{
  // The app may expose STATE on window for debugging, else scan localStorage cache
  const out={ windowKeys: Object.keys(window).filter(k=>/state|gg|app|store/i.test(k)).slice(0,20) };
  try { if (window.STATE) out.STATE_trips = window.STATE.trips?.map(t=>({id:t.id,companions:t.companions,members:(t.members||[]).map(m=>m.name)})); } catch(e){ out.err1=String(e); }
  // localStorage cached snapshot
  for (const k of Object.keys(localStorage)) {
    if (/trip|data|cache|snapshot/i.test(k)) {
      try { const v=JSON.parse(localStorage.getItem(k)); if (v && (v.trips||Array.isArray(v))) out['ls:'+k]=true; } catch{}
    }
  }
  out.lsKeys = Object.keys(localStorage);
  return out;
});
console.log(JSON.stringify(dump,null,1).slice(0,2000));
await browser.close();
