import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const b=await chromium.launch();

// ===== ANDROID UA: confirm is-ios NOT applied, bottom-nav stays bottom:0 =====
console.log('=== ANDROID UA bottom-nav float check ===');
const androidUA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const actx=await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2, userAgent:androidUA });
const ap=await actx.newPage();
await ap.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await ap.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await ap.evaluate(()=>{location.hash='#home';});
await ap.reload({waitUntil:'networkidle'});
await ap.waitForTimeout(1500);
const androidNav = await ap.evaluate(()=>{
  const nav=document.querySelector('.mobile-bottom-nav'); const r=nav.getBoundingClientRect(); const cs=getComputedStyle(nav);
  return { isIOS: document.documentElement.classList.contains('is-ios'), cssBottom:cs.bottom, navBottom:Math.round(r.bottom), vh:window.innerHeight, gapFromBottom:Math.round(window.innerHeight-r.bottom) };
});
console.log('ANDROID:', JSON.stringify(androidNav), androidNav.gapFromBottom>2?'<<< FLOATING BUG':'(flush, good)');
await actx.close();

// ===== DARK MODE sweep (a few pages) =====
console.log('\n=== DARK MODE ===');
const dctx=await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2, colorScheme:'dark' });
const dp=await dctx.newPage();
await dp.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await dp.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
// force dark theme attr if app uses data-theme
await dp.evaluate(()=>{ try{ localStorage.setItem('gg_theme','dark'); }catch(e){} document.documentElement.setAttribute('data-theme','dark'); });
await dp.evaluate(()=>{location.hash='#home';});
await dp.reload({waitUntil:'networkidle'});
await dp.waitForTimeout(1600);
await dp.evaluate(()=>{ document.documentElement.setAttribute('data-theme','dark'); });
for(const pg of ['home','expenses','budgets','settlement','feed']){
  await dp.evaluate(x=>{ location.hash='#'+x; window.dispatchEvent(new HashChangeEvent('hashchange')); },pg);
  await dp.waitForTimeout(1300);
  await dp.evaluate(()=>window.scrollTo(0,0));
  await dp.screenshot({path:`scratch/audit_mk2/shots/p06_dark_${pg}.png`});
  const theme=await dp.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  console.log(`  dark ${pg} themeAttr=${theme}`);
}
await dctx.close();
await b.close();
