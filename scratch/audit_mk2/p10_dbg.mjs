import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#settings'; });
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2000);
const info = await p.evaluate(()=>{
  const subtabs=[...document.querySelectorAll('.general-subtab')].map(e=>e.innerText);
  const cards=[...document.querySelectorAll('.theme-option-card')].map(e=>e.innerText.replace(/\n/g,'|'));
  const tabs=[...document.querySelectorAll('.settings-tab, [role=tab], .settings-nav button, .settings-sidebar button')].map(e=>e.innerText).slice(0,20);
  return {subtabs, cards, tabs, h2:[...document.querySelectorAll('h1,h2')].map(e=>e.innerText).slice(0,15)};
});
console.log(JSON.stringify(info,null,1));
await b.close();
