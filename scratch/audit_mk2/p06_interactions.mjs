import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const cfg={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch();
const ctx=await b.newContext(cfg);
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);

// ---------- 1. DRAWER open + screenshot + can scroll its content? ----------
console.log('=== 1. Drawer ===');
await p.click('#hamburgerBtn');
await p.waitForTimeout(500);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_drawer_open.png'});
const drawerGeom = await p.evaluate(()=>{
  const s=document.getElementById('sidebar');
  if(!s) return null; const r=s.getBoundingClientRect();
  return { w:Math.round(r.width), h:Math.round(r.height), scrollH:s.scrollHeight, clientH:s.clientHeight, overflowsViewport: s.scrollHeight>window.innerHeight };
});
console.log('drawer geom:', JSON.stringify(drawerGeom));
// close
await p.click('#sidebarClose').catch(()=>p.click('#sidebarOverlay'));
await p.waitForTimeout(400);

// ---------- 2. TRIP SWITCHER (mobile in-content button) ----------
console.log('=== 2. Trip switcher ===');
await p.evaluate(()=>{location.hash='#home';});
await p.waitForTimeout(800);
const hasSwitcher = await p.$('#mobileTripSwitcherBtn');
console.log('mobileTripSwitcherBtn present:', !!hasSwitcher);
if(hasSwitcher){
  await p.click('#mobileTripSwitcherBtn');
  await p.waitForTimeout(500);
  const popState = await p.evaluate(()=>{
    const pop=document.getElementById('tripControlsPopover');
    const r=pop?pop.getBoundingClientRect():null;
    return pop?{ display:pop.style.display, w:r?Math.round(r.width):0, top:Math.round(r?r.top:0), left:Math.round(r?r.left:0), right:Math.round(r?r.right:0), offRight: r? r.right>390 : null, offLeft: r? r.left<0:null }:null;
  });
  console.log('trip popover:', JSON.stringify(popState));
  await p.screenshot({path:'scratch/audit_mk2/shots/p06_trip_switcher.png'});
  await p.keyboard.press('Escape').catch(()=>{});
}
await p.waitForTimeout(300);

// ---------- 3. MODAL as bottom sheet — open New Trip modal ----------
console.log('=== 3. New Trip modal (bottom sheet?) ===');
// trigger via the popover's New Trip or the sidebar
await p.evaluate(()=>{ const el=document.getElementById('sidebar'); el&&el.classList.remove('open'); });
// open new trip modal programmatically via the button if present, else via popover
await p.click('#mobileTripSwitcherBtn').catch(()=>{});
await p.waitForTimeout(400);
let opened=false;
opened = await p.evaluate(()=>{ const b=document.getElementById('newTripBtn'); if(b){b.click();return true;} return false; });
if(!opened){ await p.click('#hamburgerBtn').catch(()=>{}); await p.waitForTimeout(400); opened=await p.evaluate(()=>{const b=document.getElementById('newTripBtnSidebar'); if(b){b.click();return true;}return false;}); }
await p.waitForTimeout(800);
const modalGeom = await p.evaluate(()=>{
  const ov=document.querySelector('.modal-overlay, .modal, [class*=modal]');
  if(!ov) return {found:false};
  // find the modal panel
  const panel=document.querySelector('.modal-content, .modal__content, .modal-card, .modal > div') || ov;
  const r=panel.getBoundingClientRect();
  const cs=getComputedStyle(panel);
  return { found:true, top:Math.round(r.top), bottom:Math.round(r.bottom), left:Math.round(r.left), w:Math.round(r.width), h:Math.round(r.height), vh:window.innerHeight, anchoredBottom: Math.abs(r.bottom-window.innerHeight)<4, fullWidthish: r.width>=380, radiusTop:cs.borderTopLeftRadius, radiusBottom:cs.borderBottomLeftRadius, cls: panel.className };
});
console.log('modal geom:', JSON.stringify(modalGeom));
await p.screenshot({path:'scratch/audit_mk2/shots/p06_modal_newtrip.png'});

console.log('\nPAGEERRORS:', errs.length?errs.slice(0,4):'none');
await ctx.close(); await b.close();
