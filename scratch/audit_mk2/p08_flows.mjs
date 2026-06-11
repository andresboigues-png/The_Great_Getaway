import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5108';
const PREFIX='p08';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage();
const cerr=[]; p.on('console',m=>{ if(m.type()==='error') cerr.push(m.text()); });
const pe=[]; p.on('pageerror',e=>pe.push(e.message));

const shot=(n)=>p.screenshot({path:`scratch/audit_mk2/shots/${PREFIX}_${n}.png`,fullPage:true}).catch(()=>{});
const mainTxt=()=>p.evaluate(()=>{const m=document.querySelector('.modal-overlay,[class*=modal],main')||document.body;return (document.body.innerText||'').replace(/\s*\n\s*\n+/g,'\n');});

await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
// fresh-ish but reuse so we can build a trip; use a 2nd fresh id so guide-state is virgin
await p.evaluate(async()=>{
  await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:'test:test-newbie-8b', name:'Liam Flows'})});
  localStorage.setItem('gg_auth_token','x');
});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2000);

// ===== FLOW A: create first trip =====
console.log('=== FLOW A: Create first trip ===');
// Click the "Create Trips" CTA on the welcome hero
await p.click('#homeCreateFirstTripBtn').catch(async()=>{ await p.click('text=+ New Trip').catch(()=>{}); });
await p.waitForTimeout(1200);
await shot('flowA_newtripmodal');
const modalText = await p.evaluate(()=>{
  const ov=document.querySelector('[class*="modal"], .modal-overlay');
  return ov? ov.innerText.replace(/\s*\n\s*\n+/g,'\n') : '(no modal found)';
});
console.log('--- New Trip modal text ---');
console.log(modalText.slice(0,1500));
// enumerate inputs/fields in the modal
const fields = await p.evaluate(()=>{
  const ov=document.querySelector('[class*="modal"], .modal-overlay')||document;
  const out=[];
  ov.querySelectorAll('input,select,textarea,button').forEach(el=>{
    out.push({tag:el.tagName, type:el.type||'', ph:el.placeholder||'', label:(el.getAttribute('aria-label')||el.value||el.textContent||'').trim().slice(0,40), id:el.id});
  });
  return out;
});
console.log('--- New Trip modal fields ---');
console.log(JSON.stringify(fields,null,1).slice(0,2000));

console.log('\nconsole errors:', cerr.length?[...new Set(cerr)].slice(0,6):'none');
console.log('pageerrors:', pe.length?pe:'none');
await ctx.close(); await b.close();
