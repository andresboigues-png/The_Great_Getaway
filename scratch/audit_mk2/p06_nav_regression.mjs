import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const MOBILE={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch();
const ctx=await b.newContext(MOBILE);
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const cerr=[]; p.on('console',m=>{ if(m.type()==='error') cerr.push(m.text()); });

await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);

function rep(o){ return JSON.stringify(o); }

// ---- Helper: dump inert/aria-hidden state of the 3 chrome regions ----
async function chromeState(label){
  const s = await p.evaluate(()=>{
    const pick=(el)=>el?{inert:el.hasAttribute('inert'),ariaHidden:el.getAttribute('aria-hidden')}:null;
    return {
      navbar: pick(document.querySelector('.navbar')),
      main: pick(document.getElementById('app-container')),
      bottomNav: pick(document.querySelector('.mobile-bottom-nav')),
      sidebarOpen: !!document.getElementById('sidebar')?.classList.contains('open'),
    };
  });
  console.log('CHROME['+label+']', rep(s));
  return s;
}

// ============================================================
// TEST 1 — Drawer -> tap a drawer link -> is page tappable?
// Repeat across multiple pages (Settings, Friends, Profile, Collections)
// ============================================================
console.log('\n=== TEST 1: drawer link -> page interactivity (inert lift) ===');
const drawerTargets = ['settings','friends','profile','collections','feed'];
for (const targetPage of drawerTargets){
  // Make sure we start from home, drawer closed
  await p.evaluate(()=>{location.hash='#home';});
  await p.waitForTimeout(500);
  // open the drawer via hamburger
  await p.click('#hamburgerBtn').catch(e=>console.log('hamburger click fail',e.message));
  await p.waitForTimeout(450);
  const afterOpen = await chromeState(targetPage+':drawer-open');
  // click the drawer link for the target page
  const linkSel = `#sidebar [data-page="${targetPage}"]`;
  const hasLink = await p.$(linkSel);
  if(!hasLink){ console.log('NO DRAWER LINK for', targetPage); continue; }
  await p.click(linkSel).catch(e=>console.log('drawer link click fail',e.message));
  await p.waitForTimeout(900);
  const afterNav = await chromeState(targetPage+':after-nav');
  // Now probe interactivity: can we actually click something in main content?
  const interactive = await p.evaluate(()=>{
    const main=document.getElementById('app-container');
    if(!main) return {ok:false,why:'no main'};
    // sample the center of the main content area
    const r=main.getBoundingClientRect();
    const cx=Math.round(r.left+r.width/2);
    const cy=Math.round(r.top+Math.min(r.height/2,300));
    const elAt=document.elementFromPoint(cx,cy);
    const blockedByInert=main.hasAttribute('inert');
    // is the element at that point inside main (good) or is it covered?
    const insideMain = elAt ? main.contains(elAt) : false;
    return { blockedByInert, insideMain, elTag: elAt?elAt.tagName:null, mainInert:main.hasAttribute('inert') };
  });
  console.log('  INTERACT['+targetPage+']', rep(interactive));
  await p.screenshot({path:`scratch/audit_mk2/shots/p06_nav_${targetPage}.png`});
}

// ============================================================
// TEST 2 — Swipe-from-Home opens drawer: does it apply inert? (desync risk)
// ============================================================
console.log('\n=== TEST 2: swipe-from-home opens drawer via openSidebar() — inert applied? ===');
await p.evaluate(()=>{location.hash='#home';});
await p.waitForTimeout(700);
// simulate a right-swipe from home: dispatch touch events
await p.evaluate(()=>{
  const fire=(type,x,y)=>{
    const t=new Touch({identifier:1,target:document.body,clientX:x,clientY:y});
    const ev=new TouchEvent(type,{cancelable:true,bubbles:true,touches:type==='touchend'?[]:[t],changedTouches:[t],targetTouches:type==='touchend'?[]:[t]});
    document.dispatchEvent(ev);
  };
  fire('touchstart',40,400);
  fire('touchend',300,405);
});
await p.waitForTimeout(500);
const swipeOpen = await chromeState('after-swipe-from-home');
// If drawer is open but main is NOT inert => the inert/aria desync (drawer behind not locked)
console.log('  SWIPE-DESYNC: drawer open=',swipeOpen.sidebarOpen,' main inert=',swipeOpen.main?.inert,'(expect both true if consistent with hamburger path)');
await p.screenshot({path:'scratch/audit_mk2/shots/p06_swipe_drawer.png'});
// close it
await p.evaluate(()=>{ document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebarOverlay')?.classList.remove('open'); });

// ============================================================
// TEST 3 — bottom bar flush to bottom at top-of-page? (Android float bug)
// ============================================================
console.log('\n=== TEST 3: bottom nav flush at top-of-scroll ===');
for (const pg of ['home','expenses','todo','ai']){
  await p.evaluate(x=>{location.hash='#'+x;},pg);
  await p.waitForTimeout(900);
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.waitForTimeout(200);
  const navGeom = await p.evaluate(()=>{
    const nav=document.querySelector('.mobile-bottom-nav');
    if(!nav) return null;
    const r=nav.getBoundingClientRect();
    const cs=getComputedStyle(nav);
    return { bottom:Math.round(r.bottom), top:Math.round(r.top), vh:window.innerHeight, gapFromBottom: Math.round(window.innerHeight-r.bottom), cssBottom:cs.bottom, position:cs.position, isIOS: document.documentElement.classList.contains('is-ios') };
  });
  console.log('  NAVGEOM['+pg+']', rep(navGeom));
}

console.log('\nPAGEERRORS:', errs.length?errs.slice(0,5):'none');
console.log('CONSOLE-ERR:', cerr.length?cerr.slice(0,5):'none');
await ctx.close(); await b.close();
