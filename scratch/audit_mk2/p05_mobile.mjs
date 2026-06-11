import { chromium } from 'playwright';
const PORT=5105, BASE=`http://127.0.0.1:${PORT}`, SHOTS='scratch/audit_mk2/shots';
async function login(page,token,name){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async ({token,name})=>{ await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name})}); localStorage.setItem('gg_auth_token','x'); },{token,name});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1600);
}
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await ctx.newPage();
await login(page,'test:test-user-1','Alex Rivera');
await page.evaluate(()=>{location.hash='#feed';window.dispatchEvent(new HashChangeEvent('hashchange'));});
await page.waitForTimeout(2500);
await page.screenshot({path:`${SHOTS}/p05_feed_mobile_posts.png`,fullPage:true});
// actions tab
await page.evaluate(()=>{ const b=document.querySelector('[data-feed-tab="actions"]'); if(b)b.click(); });
await page.waitForTimeout(1800);
await page.screenshot({path:`${SHOTS}/p05_feed_mobile_actions.png`,fullPage:true});
// open a comment thread on the share post (posts tab)
await page.evaluate(()=>{ const b=document.querySelector('[data-feed-tab="posts"]'); if(b)b.click(); });
await page.waitForTimeout(1500);
await page.evaluate(()=>{ const b=document.querySelector('.feed-comment-btn'); if(b)b.click(); });
await page.waitForTimeout(1500);
await page.screenshot({path:`${SHOTS}/p05_feed_mobile_thread.png`,fullPage:true});
console.log('mobile shots done');
await browser.close();
