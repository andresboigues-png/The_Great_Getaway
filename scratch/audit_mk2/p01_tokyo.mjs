import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5101';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#settlement';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);
// switch trip select to Tokyo
const sel = await p.$('#settlementTripSelect');
if(sel){ await sel.selectOption({label:'Tokyo Adventure'}).catch(async()=>{ await sel.selectOption('trip-tokyo').catch(()=>{});}); await p.waitForTimeout(1200);}
const txt = await p.evaluate(()=>document.querySelector('main')?.innerText||document.body.innerText);
const i = txt.indexOf('Settlements');
console.log(txt.slice(i, i+1100));
await p.screenshot({path:'scratch/audit_mk2/shots/p01_tokyo.png',fullPage:true}).catch(()=>{});
await ctx.close(); await b.close();
