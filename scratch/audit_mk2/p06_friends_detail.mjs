import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const cfg={ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 };
const b=await chromium.launch();
const ctx=await b.newContext(cfg);
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#friends'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2000);
// scroll to the tabnav pills
await p.evaluate(()=>{ const el=document.querySelector('.network-tabnav'); el&&el.scrollIntoView({block:'center'}); });
await p.waitForTimeout(400);
await p.screenshot({path:'scratch/audit_mk2/shots/p06_friends_pills390.png'});
// read the actual rendered text of the pill labels (full vs visible)
const pills = await p.evaluate(()=>{
  const tabs=[...document.querySelectorAll('.network-tabnav__tab, .network-tabnav button, [class*=tabnav] button')];
  return tabs.map(t=>{
    const lbl=t.querySelector('.network-tabnav__label')||t;
    const r=lbl.getBoundingClientRect();
    return { full: (lbl.textContent||'').trim(), scrollW: lbl.scrollWidth, clientW: Math.round(r.width), truncated: lbl.scrollWidth>lbl.clientWidth+1 };
  });
});
console.log('PILLS:', JSON.stringify(pills,null,1));
// also dump the find-users header line
const hdr = await p.evaluate(()=>{
  // find element containing 'Find users'
  const all=[...document.querySelectorAll('#app-container *')];
  const h=all.find(e=>/Find users/i.test(e.textContent||'') && e.children.length<=4 && (e.textContent||'').length<60);
  if(!h) return null;
  return { html: h.outerHTML.slice(0,300) };
});
console.log('FIND-USERS HEADER:', JSON.stringify(hdr));
await ctx.close(); await b.close();
