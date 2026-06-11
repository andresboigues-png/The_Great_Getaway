import { chromium } from 'playwright';
const PORT=5105, BASE=`http://127.0.0.1:${PORT}`, SHOTS='scratch/audit_mk2/shots';
async function login(page,token,name){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ({token,name})=>{ await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name})}); localStorage.setItem('gg_auth_token','x'); },{token,name});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1600);
}
async function feedActionsShot(page, name){
  await page.evaluate(()=>{location.hash='#feed';window.dispatchEvent(new HashChangeEvent('hashchange'));});
  await page.waitForTimeout(2200);
  await page.evaluate(()=>{ const b=document.querySelector('[data-feed-tab="actions"]'); if(b)b.click(); });
  await page.waitForTimeout(1800);
  await page.screenshot({path:`${SHOTS}/${name}.png`,fullPage:true});
  // capture the settled_up line text
  return await page.evaluate(()=>{
    const lines=[...document.querySelectorAll('.feed-event')].map(e=>e.innerText.replace(/\n+/g,' ').trim()).filter(x=>/settled/i.test(x));
    return lines;
  });
}
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1280,height:1000}});

// Sara's view of the settlement (she is payer → should say "You settled up with Alex")
const sp=await ctx.newPage();
await login(sp,'test:test-user-2','Sara Lopez');
const saraLines=await feedActionsShot(sp,'p05_settle_sara_view');
console.log('SARA settled lines:', JSON.stringify(saraLines));
await sp.close();

// Alex's view (recipient → bug "Sara settled up with Sara")
const ap=await ctx.newPage();
await login(ap,'test:test-user-1','Alex Rivera');
const alexLines=await feedActionsShot(ap,'p05_settle_alex_view');
console.log('ALEX settled lines:', JSON.stringify(alexLines));

// Now Alex BLOCKS Sara, re-check Actions feed for the settled_up card persisting
await ap.evaluate(async ()=>{ await fetch('/api/blocks/test-user-2',{method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin}}); });
await ap.waitForTimeout(800);
const afterBlock=await feedActionsShot(ap,'p05_settle_alex_afterblock');
console.log('ALEX after-block settled lines (block leak?):', JSON.stringify(afterBlock));
// unblock to restore
await ap.evaluate(async ()=>{ await fetch('/api/blocks/test-user-2',{method:'DELETE',headers:{'Content-Type':'application/json','Origin':location.origin}}); });
await ap.close();
await browser.close();
