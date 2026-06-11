import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5108';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
await p.evaluate(async()=>{
  await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:'test:test-newbie-8', name:'Liam Newbie'})});
  localStorage.setItem('gg_auth_token','x');
});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2500);

// Click "Show Quick Access"
await p.click('text=Show Quick Access').catch(()=>{});
await p.waitForTimeout(1500);
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await p.waitForTimeout(800);
await p.screenshot({path:'scratch/audit_mk2/shots/p08_guide_expanded.png',fullPage:true}).catch(()=>{});
const guideTxt = await p.evaluate(()=>{
  // find the guide card
  const cards=[...document.querySelectorAll('.card.glass, .card')];
  for(const c of cards){ if(/Getting Started|Quick Access|Step 1|Sign in/i.test(c.innerText)) return c.innerText.replace(/\s*\n\s*\n+/g,'\n'); }
  return '(guide card not found) BODY:'+document.body.innerText.slice(-1200);
});
console.log('=== GUIDE CONTENT (after Show Quick Access) ===');
console.log(guideTxt);

// Look for an add-day affordance on the Path tab
const addDayUi = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('button,a,[role=button]').forEach(el=>{
    const t=(el.innerText||el.getAttribute('aria-label')||'').trim();
    if(/add.*day|new day|create.*day|\+ day|add day|create some/i.test(t)) out.push(t.slice(0,50));
  });
  return out;
});
console.log('\n=== Add-day affordances found on Home: ===', JSON.stringify(addDayUi));
await ctx.close(); await b.close();
