import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);

const active=()=>p.evaluate(()=>{const a=document.activeElement; return a?`${a.tagName}.${(a.className||'').toString().split(' ')[0]}#${a.id} "${(a.innerText||a.value||a.getAttribute('aria-label')||'').slice(0,30).replace(/\n/g,' ')}"`:'none';});

// --- 1) focus-visible test: Tab from top and capture outline of focused element
console.log('=== TAB ORDER (first 12 stops from page top) ===');
await p.evaluate(()=>{ (document.activeElement instanceof HTMLElement)&&document.activeElement.blur(); window.scrollTo(0,0); });
await p.keyboard.press('Tab');
for(let i=0;i<12;i++){
  const a=await active();
  const outline=await p.evaluate(()=>{const e=document.activeElement; if(!e)return''; const cs=getComputedStyle(e); return `outline:${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}; box-shadow:${(cs.boxShadow||'').slice(0,30)}`;});
  console.log(`  Tab#${i+1}:`, a, '|', outline);
  await p.keyboard.press('Tab');
}

// --- 2) Drawer (hamburger) keyboard open + inert + trap
console.log('\n=== DRAWER inert/trap ===');
const ham = p.locator('#hamburgerBtn');
await ham.focus(); 
console.log('hamburger focused:', await active());
await p.keyboard.press('Enter');
await p.waitForTimeout(700);
const drawerState = await p.evaluate(()=>({
  open: document.querySelector('.sidebar-drawer,#sidebar,.sidebar')?.className||'(no .sidebar-drawer)',
  appInert: document.getElementById('app-container')?.hasAttribute('inert'),
  navInert: document.querySelector('.top-nav,nav')?.hasAttribute('inert'),
  focusedAfterOpen: document.activeElement?.id||document.activeElement?.className,
}));
console.log('after open:', JSON.stringify(drawerState));
// Tab a few times inside drawer, see if focus escapes to inert area
let escaped=false, stops=[];
for(let i=0;i<14;i++){ await p.keyboard.press('Tab'); const a=await p.evaluate(()=>({id:document.activeElement?.id, cls:(document.activeElement?.className||'').toString().split(' ')[0], inInertAncestor: !!document.activeElement?.closest('[inert]')})); stops.push(a.id||a.cls); if(a.inInertAncestor) escaped=true; }
console.log('drawer tab stops:', JSON.stringify(stops));
console.log('focus escaped into inert region:', escaped);
// Esc closes + restores focus
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
console.log('after Esc, focus:', await active());
const afterClose=await p.evaluate(()=>({appInert:document.getElementById('app-container')?.hasAttribute('inert')}));
console.log('after Esc, app-container inert (should be false):', JSON.stringify(afterClose));

await b.close();
