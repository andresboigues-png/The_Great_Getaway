import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
const axeSrc=readFileSync('node_modules/axe-core/axe.min.js','utf8');
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
// force dark by setting attribute + localStorage (faithful enough, theme.ts reads it)
await p.evaluate(()=>{ try{localStorage.setItem('gg.theme','dark');}catch{}; document.documentElement.setAttribute('data-theme','dark'); });
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');});
const isDark=await p.evaluate(()=>document.documentElement.getAttribute('data-theme'));
console.log('theme attr:', isDark);
for(const pg of ['home','expenses','budgets','settlement','insights','feed','collections','profile']){
  await p.evaluate(h=>{location.hash='#'+h;},pg); await p.waitForTimeout(1300);
  await p.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  await p.screenshot({path:`scratch/audit_mk2/shots/p10_dark_${pg}.png`});
}
// axe contrast in dark
await p.evaluate(()=>{location.hash='#budgets';}); await p.waitForTimeout(1300);
await p.evaluate(axeSrc);
const r=await p.evaluate(async()=>{const res=await window.axe.run(document,{runOnly:['color-contrast']}); return res.violations.flatMap(v=>v.nodes.slice(0,4).map(n=>({html:n.html.slice(0,70), d:n.any.find(a=>a.id==='color-contrast')?.data})));});
console.log('DARK budgets contrast:', JSON.stringify(r,null,1));
await b.close();
