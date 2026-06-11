import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
const axeSrc=readFileSync('node_modules/axe-core/axe.min.js','utf8');
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#home'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);

// --- New Trip modal focus trap
console.log('=== NEW TRIP MODAL focus trap ===');
await p.locator('#newTripBtn').focus();
await p.keyboard.press('Enter');
await p.waitForTimeout(800);
const modalUp=await p.evaluate(()=>!!document.querySelector('[aria-modal="true"], .modal-overlay, .mdl-overlay'));
console.log('modal open:', modalUp, '| focus now:', await p.evaluate(()=>document.activeElement?.tagName+'.'+(document.activeElement?.className||'').split(' ')[0]));
// Tab around and ensure focus stays in modal
let outside=false, stops=[];
for(let i=0;i<10;i++){await p.keyboard.press('Tab'); const r=await p.evaluate(()=>({tag:document.activeElement?.tagName, inModal: !!document.activeElement?.closest('[aria-modal="true"], .modal-overlay, .mdl-overlay, .modal-card')})); stops.push(r.tag+(r.inModal?'':'[OUT]')); if(!r.inModal) outside=true;}
console.log('tab stops in modal:', stops.join(' '), '| escaped modal:', outside);
// Esc closes + restores focus to trigger
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
console.log('after Esc, modal gone:', await p.evaluate(()=>!document.querySelector('[aria-modal="true"]')), '| focus restored to:', await p.evaluate(()=>document.activeElement?.id||document.activeElement?.className));

// --- axe on expenses (history tab with icon buttons) ---
console.log('\n=== AXE expenses (full) ===');
await p.evaluate(()=>{location.hash='#expenses';}); await p.waitForTimeout(1500);
await p.evaluate(axeSrc);
const r=await p.evaluate(async()=>{const res=await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}); return res.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,help:v.help,sample:v.nodes.slice(0,1).map(n=>n.html.slice(0,120))}));});
console.log(JSON.stringify(r,null,1));
// count icon-only buttons with NO accessible name anywhere
const unlabeled=await p.evaluate(()=>{
  const btns=[...document.querySelectorAll('button, a[role=button]')];
  const bad=btns.filter(b=>{const txt=(b.innerText||'').trim(); const al=b.getAttribute('aria-label'); const tl=b.getAttribute('title'); const lb=b.getAttribute('aria-labelledby'); const hasSvgTitle=b.querySelector('svg title'); return !txt && !al && !tl && !lb && !hasSvgTitle && b.offsetParent!==null;});
  return bad.slice(0,12).map(b=>b.className.split(' ').slice(0,2).join('.')+' #'+b.id);
});
console.log('VISIBLE icon-only buttons with NO accessible name:', JSON.stringify(unlabeled));
await b.close();
