import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
const axeSrc=readFileSync('node_modules/axe-core/axe.min.js','utf8');
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
for(const pg of ['home','expenses','insights','budgets','settlement','feed']){
  await p.evaluate(h=>{location.hash='#'+h;},pg); await p.waitForTimeout(1200);
  await p.evaluate(axeSrc);
  const r=await p.evaluate(async()=>{const res=await window.axe.run(document,{runOnly:['color-contrast']}); return res.violations.flatMap(v=>v.nodes.map(n=>({html:n.html.slice(0,90), data:n.any.find(a=>a.id==='color-contrast')?.data})));});
  if(r.length) console.log(`\n[${pg}] contrast violations:`, JSON.stringify(r,null,1));
}
await b.close();
