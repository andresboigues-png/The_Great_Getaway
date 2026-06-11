import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
const BASE='http://127.0.0.1:5110';
const PAGES=['home','todo','ai','expenses','budgets','settlement','insights','feed','friends','collections','profile','search'];
const NATIVE={en:'English', es:'Español', fr:'Français', pt:'Português'};

const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));

await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#settings'; });
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1600);

const LANG = process.argv[2] || 'en';

// Settings overview -> General Settings "Configure" -> Language sub-tab -> pick card
await p.getByText(/^General Settings/i).locator('xpath=ancestor::*[self::button or self::a or @role="button"][1]').first().click().catch(async()=>{
  // fallback: click the Configure inside the general card by index 0
  await p.getByText(/Configure/i).first().click().catch(e=>console.log('cfg fail',e.message.slice(0,40)));
});
await p.waitForTimeout(1000);
await p.locator('.general-subtab').filter({hasText:/Language|Idioma|Langue/i}).first().click().catch(e=>console.log('subtab fail',e.message.slice(0,40)));
await p.waitForTimeout(600);
await p.locator('.theme-option-card').filter({has: p.locator('.theme-option-card__body', {hasText: NATIVE[LANG]})}).first().click().catch(e=>console.log('card fail',e.message.slice(0,60)));
await p.waitForTimeout(1500);
const activeLocale = await p.evaluate(()=> document.documentElement.lang);
console.log('after pick, <html lang>=', activeLocale, '(want '+LANG+')');

// screenshot the language picker + settings sub-tabs themselves
await p.screenshot({path:`scratch/audit_mk2/shots/p10_${LANG}_settings_lang.png`}).catch(()=>{});

const out={};
for (const h of PAGES) {
  await p.evaluate(x=>{location.hash='#'+x;},h);
  await p.waitForTimeout(1100);
  await p.screenshot({path:`scratch/audit_mk2/shots/p10_${LANG}_${h}.png`, fullPage:false}).catch(()=>{});
  const leaks = await p.evaluate(()=>{
    const txt = document.body.innerText;
    const m = txt.match(/\b[a-z][a-zA-Z]{2,}\.[a-z][a-zA-Z]{2,}(\.[a-z][a-zA-Z]+)?\b/g) || [];
    return [...new Set(m)].filter(s=>!/\.(com|org|net|js|ts|png|jpg|jpeg|co|io|app|dev|html|css|pdf|gov|edu|me|fr|es|pt)\b/.test(s)).slice(0,25);
  });
  if(leaks.length) out[h+'_LEAKS']=leaks;
}
console.log('LANG=',LANG,' pageerrors:', errs.length, JSON.stringify(out,null,1));
await ctx.close(); await b.close();
