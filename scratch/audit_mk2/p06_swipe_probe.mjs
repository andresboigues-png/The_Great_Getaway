import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const MOBILE={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch();
const ctx=await b.newContext(MOBILE);
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);

// Confirm openSidebar() (swipe path) does NOT set inert. Call it directly the way mobileSwipe does.
console.log('--- direct openSidebar() equivalent (what swipe-from-home runs) ---');
await p.evaluate(()=>{
  // EXACT replica of mobileSwipe.openSidebar()
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
});
await p.waitForTimeout(300);
let s = await p.evaluate(()=>{
  const pick=(el)=>el?{inert:el.hasAttribute('inert'),ariaHidden:el.getAttribute('aria-hidden')}:null;
  return { navbar:pick(document.querySelector('.navbar')), main:pick(document.getElementById('app-container')), bottomNav:pick(document.querySelector('.mobile-bottom-nav')), sidebarOpen:!!document.getElementById('sidebar')?.classList.contains('open'), hamburgerExpanded: document.getElementById('hamburgerBtn')?.getAttribute('aria-expanded') };
});
console.log('AFTER swipe-style open:', JSON.stringify(s));
console.log('  => If main.inert is null/false while sidebarOpen=true, the page BEHIND the drawer is still tappable + the hamburger aria-expanded is stale.');

// Now: with drawer "open" via swipe-style, try tapping a point in the (visually covered) main area.
// The drawer covers ~80% width. Tap a spot on the RIGHT edge (visible overlay region) and a spot in main.
const probe = await p.evaluate(()=>{
  const main=document.getElementById('app-container');
  const r=main.getBoundingClientRect();
  // overlay should intercept clicks. What's at a point in the middle of screen?
  const elAt=document.elementFromPoint(195,400);
  return { elAtCenter: elAt? (elAt.id||elAt.className||elAt.tagName):null, mainInert: main.hasAttribute('inert') };
});
console.log('  PROBE center point:', JSON.stringify(probe));

// close
await p.evaluate(()=>{ document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebarOverlay')?.classList.remove('open'); });
await p.waitForTimeout(200);

// ---- IntersectionObserver error: which page triggers it? ----
console.log('\n--- IntersectionObserver pageerror tracing ---');
const perPage={};
p.on('pageerror',e=>{ const k=p.url(); /* approximate */ });
for (const pg of ['home','todo','ai','expenses','budgets','settlement','insights','feed','friends','collections','profile','settings','search']){
  const errs=[]; const h=e=>errs.push(e.message); p.on('pageerror',h);
  await p.evaluate(x=>{location.hash='#'+x;},pg);
  await p.waitForTimeout(1100);
  p.off('pageerror',h);
  const io = errs.filter(m=>/IntersectionObserver/.test(m)).length;
  if(io||errs.length) console.log(`  [${pg}] total-errs=${errs.length} IO-errs=${io}`, errs.slice(0,1));
}
await ctx.close(); await b.close();
