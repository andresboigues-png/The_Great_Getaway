import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#settings'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
await p.getByText(/^General Settings/i).locator('xpath=ancestor::*[self::button or self::a or @role="button"][1]').first().click().catch(async()=>{await p.getByText(/Configure/i).first().click();});
await p.waitForTimeout(900);
await p.locator('.general-subtab').filter({hasText:/Language|Langue/i}).first().click();
await p.waitForTimeout(600);

const grab=async(label)=>{
  const d=await p.evaluate(()=>({
    htmlLang:document.documentElement.lang,
    subtabs:[...document.querySelectorAll('.general-subtab__label')].map(e=>e.innerText),
    back:[...document.querySelectorAll('button,a')].map(e=>e.innerText).filter(t=>/Back to|Retour|Volver|Voltar/i.test(t)),
    title:[...document.querySelectorAll('h1')].map(e=>e.innerText).slice(0,2),
    langHeading:[...document.querySelectorAll('h2')].map(e=>e.innerText).slice(0,3),
  }));
  console.log(label, JSON.stringify(d));
};
await grab('BEFORE pick (en)');
// pick FR and immediately grab WITHOUT extra nav
await p.locator('.theme-option-card').filter({has:p.locator('.theme-option-card__body',{hasText:'Français'})}).first().click();
await p.waitForTimeout(400);
await grab('IMMEDIATELY after FR pick');
await p.waitForTimeout(1500);
await grab('1.5s after FR pick');
await p.screenshot({path:'scratch/audit_mk2/shots/p10_stale_after_fr.png'});
// now try navigating to expenses via clicking the nav link "Dépenses"
await p.getByText(/^Dépenses$/).first().click().catch(e=>console.log('expenses nav click fail',e.message.slice(0,40)));
await p.waitForTimeout(1500);
const onPage=await p.evaluate(()=>({h1:[...document.querySelectorAll('h1')].map(e=>e.innerText).slice(0,2), hash:location.hash}));
console.log('AFTER clicking Dépenses nav:', JSON.stringify(onPage));
await p.screenshot({path:'scratch/audit_mk2/shots/p10_stale_expenses_nav.png'});
await b.close();
