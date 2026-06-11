import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5109';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const dialogs=[]; p.on('dialog',d=>{dialogs.push(d.message());d.dismiss().catch(()=>{});});
// Install XSS sentinel as early as possible
await p.addInitScript(()=>{ window.__XSS_FIRED=0; const _a=window.alert; window.alert=(m)=>{window.__XSS_FIRED++;}; });
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});

async function visit(hash, extra){
  await p.evaluate(x=>{location.hash='#'+x;},hash);
  await p.reload({waitUntil:'networkidle'}).catch(()=>{});
  await p.waitForTimeout(1800);
  if(extra) await extra().catch(e=>console.log('  extra err',hash,String(e).slice(0,80)));
  const fired=await p.evaluate(()=>window.__XSS_FIRED||0);
  const title=await p.title();
  // count any literal <img onerror in DOM that DIDN'T get escaped == still raw markup nodes
  const rawImgs=await p.evaluate(()=>document.querySelectorAll('img[onerror]').length);
  const rawScripts=await p.evaluate(()=>{let c=0;document.querySelectorAll('script').forEach(s=>{if((s.textContent||'').includes('__XSS_FIRED'))c++;});return c;});
  console.log(`#${hash}: XSS_FIRED=${fired} titleHijack=${title==='XSSFIRED'} rawImgOnerror=${rawImgs} injectedScripts=${rawScripts}`);
}

// Home: trip cards (name), open the XSS trip to render day/expense/checklist
await visit('home', async()=>{
  // try to click the XSS trip card to open it
  const card = await p.locator('text=XSS').first();
  if(await card.count()){ await card.click({timeout:3000}).catch(()=>{}); await p.waitForTimeout(1500); }
});
await visit('expenses');
await visit('budgets');
await visit('settlement');
await visit('collections');
await visit('feed');
await visit('insights');
await visit('search', async()=>{
  // type to trigger search render of trip names
  const inp=await p.locator('input[type="search"], input[type="text"]').first();
  if(await inp.count()){ await inp.fill('XSS').catch(()=>{}); await p.waitForTimeout(1200); }
});

const totalFired=await p.evaluate(()=>window.__XSS_FIRED||0);
console.log('\nTOTAL XSS_FIRED across session:', totalFired);
console.log('dialogs:', dialogs.length?dialogs:'none');
console.log('pageerrors:', errs.length?errs.slice(0,5):'none');
await p.screenshot({path:'scratch/audit_mk2/shots/p09_xss_home.png',fullPage:false}).catch(()=>{});
await ctx.close(); await b.close();
