import { chromium } from 'playwright';
const PORT=5105, BASE=`http://127.0.0.1:${PORT}`;
async function login(page,token,name){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ({token,name})=>{ await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name})}); localStorage.setItem('gg_auth_token','x'); },{token,name});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(2000);
}
const browser=await chromium.launch();
const page=await (await browser.newContext({viewport:{width:1280,height:1000}})).newPage();
await login(page,'test:test-user-1','Alex Rivera');
await page.evaluate(()=>{location.hash='#home';window.dispatchEvent(new HashChangeEvent('hashchange'));});
await page.waitForTimeout(2000);
const out = await page.evaluate(()=>{
  try {
    const s=JSON.parse(localStorage.getItem('theGreatEscapeState'));
    const trips=s.trips||[];
    const lis=trips.find(t=>t.id==='trip-lisbon');
    return { lisCompanions: lis?.companions, lisMembers:(lis?.members||[]).map(m=>m.name+':'+m.role), myRole: lis?.myRole, ownerId: lis?.ownerId, companionsLen:(lis?.companions||[]).length };
  } catch(e){ return {err:String(e)}; }
});
console.log(JSON.stringify(out,null,1));
await browser.close();
