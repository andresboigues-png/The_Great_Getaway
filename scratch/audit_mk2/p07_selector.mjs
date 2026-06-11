import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5107';
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2}); const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';}); await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
const opts = await p.evaluate(()=>{
  const sel = document.getElementById('tripSelector');
  if(!sel) return 'NO #tripSelector';
  return {tag: sel.tagName, options: [...sel.options].map(o=>({v:o.value,t:o.textContent.trim()}))};
});
console.log('tripSelector:', JSON.stringify(opts,null,1));
// Switch to Tokyo
await p.evaluate(()=>{const s=document.getElementById('tripSelector'); if(s){s.value='trip-tokyo'; s.dispatchEvent(new Event('change',{bubbles:true}));}});
await p.waitForTimeout(1500);
const activeAfter = await p.evaluate(()=>{const s=document.getElementById('tripSelector'); return s?s.value:'?';});
console.log('after switch, selector value:', activeAfter);
await p.screenshot({path:'scratch/audit_mk2/shots/p07_after_switch_tokyo.png',fullPage:false});
await ctx.close(); await b.close();
