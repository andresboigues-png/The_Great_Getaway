import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5110';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
await p.evaluate(()=>{ location.hash='#settings'; });
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500);
// flip to FR
await p.getByText(/^General Settings/i).locator('xpath=ancestor::*[self::button or self::a or @role="button"][1]').first().click().catch(async()=>{await p.getByText(/Configure/i).first().click();});
await p.waitForTimeout(900);
await p.locator('.general-subtab').filter({hasText:/Language|Langue/i}).first().click();
await p.waitForTimeout(500);
await p.locator('.theme-option-card').filter({has:p.locator('.theme-option-card__body',{hasText:'Français'})}).first().click();
await p.waitForTimeout(1500);
console.log('lang now', await p.evaluate(()=>document.documentElement.lang));
// screenshot the General settings page AS-IS (still on settings)
await p.screenshot({path:'scratch/audit_mk2/shots/p10_fr_settings_general.png'});
// Now go back to Control Center overview to see if it's translated
await p.getByText(/Back to Control Center|Retour/i).first().click().catch(e=>console.log('back fail',e.message.slice(0,40)));
await p.waitForTimeout(1000);
await p.screenshot({path:'scratch/audit_mk2/shots/p10_fr_settings_overview.png'});
const overviewText = await p.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,p,button')].map(e=>e.innerText).filter(Boolean).slice(0,40));
console.log('OVERVIEW TEXT:', JSON.stringify(overviewText,null,1));
// Now navigate to real home
await p.evaluate(()=>{location.hash='#home';}); await p.waitForTimeout(1500);
await p.screenshot({path:'scratch/audit_mk2/shots/p10_fr_home_real.png'});
await b.close();
