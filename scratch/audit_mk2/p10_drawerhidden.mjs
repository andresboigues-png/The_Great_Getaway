import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
const info = await p.evaluate(()=>{
  const drawer=document.querySelector('.sidebar.glass, #sidebar, .sidebar-drawer, aside.sidebar');
  const closeBtn=document.getElementById('sidebarClose');
  const cs = drawer?getComputedStyle(drawer):null;
  const rect = closeBtn?.getBoundingClientRect();
  return {
    drawerClass: drawer?.className,
    drawerDisplay: cs?.display, drawerVisibility: cs?.visibility, drawerTransform: cs?.transform?.slice(0,40), drawerOpacity: cs?.opacity,
    drawerHasInert: drawer?.hasAttribute('inert'),
    drawerAriaHidden: drawer?.getAttribute('aria-hidden'),
    closeBtnVisible: rect?`x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)}`:'no rect',
    closeBtnTabIndex: closeBtn?.tabIndex,
  };
});
console.log('CLOSED DRAWER STATE:', JSON.stringify(info,null,1));
// is the close button actually reachable/clickable? (offscreen via transform but still tabbable?)
const closeBtnFocusable = await p.evaluate(()=>{ const el=document.getElementById('sidebarClose'); el?.focus(); return document.activeElement===el; });
console.log('closed-drawer close-btn can receive focus:', closeBtnFocusable);
await b.close();
