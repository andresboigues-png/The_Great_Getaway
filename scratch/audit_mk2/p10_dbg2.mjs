import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#settings'; });
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);
// dump clickable cards
const cards = await p.evaluate(()=> [...document.querySelectorAll('button, a, [role=button], .card')].map((e,i)=>({i, cls:e.className, txt:e.innerText.slice(0,40).replace(/\n/g,'|')})).filter(c=>c.txt));
console.log('CLICKABLES:', JSON.stringify(cards.slice(0,40),null,1));
await b.close();
