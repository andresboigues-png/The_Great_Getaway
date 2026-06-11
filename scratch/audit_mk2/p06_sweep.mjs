import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5106';
const SIZES = {
  s360: { viewport:{width:360,height:640}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
  m390: { viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
  l430: { viewport:{width:430,height:932}, isMobile:true, hasTouch:true, deviceScaleFactor:2 },
};
const PAGES = ['home','todo','ai','expenses','budgets','settlement','insights','feed','friends','collections','profile','settings','search'];
const which = process.argv[2] || 'm390';
const cfg = SIZES[which];
const b=await chromium.launch();
const ctx=await b.newContext(cfg);
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{location.hash='#home';});
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1800);

const VW = cfg.viewport.width;
async function overflowCheck(pg){
  return await p.evaluate((vw)=>{
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const horiz = docW > vw+1;
    // find offending wide elements
    const offenders=[];
    if(horiz){
      const all=document.querySelectorAll('#app-container *');
      for(const el of all){
        const r=el.getBoundingClientRect();
        if(r.right > vw+2 && r.width>20 && r.width<3000){
          offenders.push({ sel: el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').slice(0,2).join('.'):''), right:Math.round(r.right), w:Math.round(r.width) });
          if(offenders.length>=6) break;
        }
      }
    }
    // tiny tap targets in main content: links/buttons < 44 in either dim
    const tiny=[];
    const tappable=document.querySelectorAll('#app-container a, #app-container button, #app-container [role="button"], #app-container input[type=checkbox], #app-container select');
    for(const el of tappable){
      const r=el.getBoundingClientRect();
      if(r.width===0||r.height===0) continue; // hidden
      if((r.height<40||r.width<40)){
        const label=(el.getAttribute('aria-label')||el.textContent||el.id||'').trim().slice(0,24);
        tiny.push({ tag:el.tagName.toLowerCase(), id:el.id||null, h:Math.round(r.height), w:Math.round(r.width), label });
        if(tiny.length>=10) break;
      }
    }
    // content hidden behind bottom nav? check last child of main vs nav top
    const nav=document.querySelector('.mobile-bottom-nav');
    const navTop = nav? nav.getBoundingClientRect().top : null;
    return { docW, bodyW, horiz, offenders, tinyCount:tiny.length, tiny, navTop };
  }, VW);
}

const results={};
for (const pg of PAGES){
  await p.evaluate(x=>{location.hash='#'+x;},pg);
  await p.waitForTimeout(1300);
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.waitForTimeout(150);
  await p.screenshot({path:`scratch/audit_mk2/shots/p06_${which}_${pg}.png`,fullPage:false}).catch(()=>{});
  const r = await overflowCheck(pg);
  results[pg]=r;
  console.log(`[${which}|${pg}] horiz=${r.horiz} docW=${r.docW}/${VW} tinyTargets=${r.tinyCount}`);
  if(r.horiz) console.log('   OVERFLOW:', JSON.stringify(r.offenders));
  if(r.tinyCount) console.log('   TINY:', JSON.stringify(r.tiny.slice(0,5)));
}
console.log('SWEEP DONE', which);
await ctx.close(); await b.close();
