import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5107';
const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
async function login(){await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});}
await login();
await p.evaluate(async()=>{await fetch('/api/trips/trip-lisbon/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});});
await p.evaluate(()=>{location.hash='#collections';});
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
const rb=await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]'); await rb.click(); await p.waitForTimeout(400);
await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/^restore$/i.test((b.textContent||'').trim()));if(t)t.click();});
await p.waitForTimeout(1500);
const ob = await p.evaluate(()=>localStorage.getItem('gg_outbox_v1'));
console.log('OUTBOX gg_outbox_v1 =', ob);
await ctx.close(); await b.close();
