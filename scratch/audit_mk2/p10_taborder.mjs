import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
await p.evaluate(()=>{ window.scrollTo(0,0); document.body.focus(); });
// press Tab 40 times, record id/class + whether it's in nav
const seq=[];
for(let i=0;i<45;i++){
  await p.keyboard.press('Tab');
  const a=await p.evaluate(()=>{const e=document.activeElement; if(!e)return'none'; const inNav=!!e.closest('.top-nav, nav, .nav-bar, #navbar, header'); const isSkip=(e.className||'').toString().includes('skip'); return (isSkip?'[SKIP] ':'')+(inNav?'[NAV] ':'')+e.tagName+'.'+(e.className||'').toString().split(' ')[0]+'#'+e.id+' "'+(e.innerText||e.getAttribute('aria-label')||'').slice(0,22).replace(/\n/g,' ')+'"';});
  seq.push(`${i+1}. ${a}`);
}
console.log(seq.join('\n'));
await b.close();
