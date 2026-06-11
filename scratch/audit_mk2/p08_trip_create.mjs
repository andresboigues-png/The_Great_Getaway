import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5108';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
await p.evaluate(async()=>{
  await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:'test:test-newbie-8c', name:'Liam Create'})});
  localStorage.setItem('gg_auth_token','x');
});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(2200);

// what is the google maps state?
const gstate = await p.evaluate(()=>({
  google: typeof window.google,
  maps: !!(window.google&&window.google.maps),
  places: !!(window.google&&window.google.maps&&window.google.maps.places),
}));
console.log('GOOGLE STATE in sandbox:', JSON.stringify(gstate));

await p.click('#homeCreateFirstTripBtn').catch(()=>{});
await p.waitForTimeout(1000);
await p.fill('#tripName','Lisbon Test');
await p.fill('#tripPlaceInput','Lisbon');
await p.waitForTimeout(1500);
const state1 = await p.evaluate(()=>{
  const sb=document.querySelector('#newTripSubmitBtn');
  const hint=document.querySelector('#tripPlaceHint');
  return {submitDisabled: sb? sb.disabled : '(none)', hint: hint? hint.textContent : '(none)'};
});
console.log('After typing "Lisbon":', JSON.stringify(state1));
await p.screenshot({path:'scratch/audit_mk2/shots/p08_trip_typed.png',fullPage:true}).catch(()=>{});

// Try to force-create via the manual path: simulate the google-undefined branch by
// checking if there's any way the user gets unblocked.
console.log('NOTE: if submitDisabled=true with a typed dest and no dropdown, newbie is BLOCKED on first action.');
await ctx.close(); await b.close();
