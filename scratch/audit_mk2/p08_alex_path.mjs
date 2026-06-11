import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5108';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1100},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
await p.evaluate(async()=>{
  await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:'test:test-user-1', name:'Alex Rivera'})});
  localStorage.setItem('gg_auth_token','x');
});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2800);
await p.screenshot({path:'scratch/audit_mk2/shots/p08_alex_home.png',fullPage:true}).catch(()=>{});

// look at the path chips + anchor / trip-hub presentation
const info = await p.evaluate(()=>{
  const out={chips:[],addDay:false,tripHubMentions:0};
  document.querySelectorAll('.path-chip').forEach(c=>out.chips.push({txt:(c.innerText||'').trim(), title:c.getAttribute('title')||'', cls:c.className}));
  out.addDay = !!document.querySelector('#pathAddDayChip');
  out.tripHubMentions = (document.body.innerText.match(/Trip Hub/gi)||[]).length;
  out.anchorVisible = /Trip Hub|Anchor/i.test(document.body.innerText);
  return out;
});
console.log('=== Alex Home path chips ===');
console.log(JSON.stringify(info,null,1));
await ctx.close(); await b.close();
