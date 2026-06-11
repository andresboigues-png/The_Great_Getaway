import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#settings'; });
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);
// Try clicking text "General" CTA
const generalBtns = await p.evaluate(()=> [...document.querySelectorAll('button, a, [role=button]')].map((e)=>e.innerText.replace(/\n/g,'|')).filter(t=>/General|Configure|Open|Manage/i.test(t)));
console.log('GENERAL-ish buttons:', JSON.stringify(generalBtns));
// click the "Configure →" under General Settings (first matching configure within general card)
await p.getByText(/Configure/i).first().click().catch(e=>console.log('configure click fail',e.message.slice(0,50)));
await p.waitForTimeout(1500);
const after = await p.evaluate(()=>({subtabs:[...document.querySelectorAll('.general-subtab')].map(e=>e.innerText), h2:[...document.querySelectorAll('h2')].map(e=>e.innerText)}));
console.log('AFTER CONFIGURE:', JSON.stringify(after,null,1));
await p.screenshot({path:'scratch/audit_mk2/shots/p10_dbg_general.png'});
await b.close();
