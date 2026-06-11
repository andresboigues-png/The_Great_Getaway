// Drive Budgets: create a small budget via the modal, then go over it,
// check warning state + math. Also test the create-budget modal currency.
import { chromium } from 'playwright';
const BASE='http://127.0.0.1:5102', SHOTS='scratch/audit_mk2/shots';
const errors=[],cerrs=[];

async function login(page){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex Rivera'})});localStorage.setItem('gg_auth_token','x');});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1500);
}
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1280,height:1500}})).newPage();
page.on('console',m=>{if(m.type()==='error')cerrs.push(m.text());});
page.on('pageerror',e=>errors.push(String(e)));
await login(page);

// Navigate to Budgets via left sidebar (wallet icon) — fall back to hash.
await page.evaluate(()=>{ location.hash='#budgets'; });
await page.waitForTimeout(400);
await page.evaluate(()=>{ location.hash=''; location.hash='#budgets'; });
await page.waitForTimeout(1000);
let onBudgets = await page.locator('text=/New budget/i').count();
console.log('on budgets page:', onBudgets>0);

// Open the create-budget modal.
await page.locator('button:has-text("New budget")').first().click();
await page.waitForTimeout(700);
await page.screenshot({path:`${SHOTS}/p02_budget_modal.png`});
// Inspect modal currency options + the per-person dropdown.
const modalDiag = await page.evaluate(()=>{
  const cur=document.querySelector('#newBudCurr');
  const trip=document.querySelector('#newBudTrip');
  const cat=document.querySelector('#newBudCat');
  const user=document.querySelector('#newBudUser');
  return {
    currCount: cur?cur.options.length:null,
    tripOpts: trip?Array.from(trip.options).map(o=>o.textContent.trim()):null,
    catOpts: cat?Array.from(cat.options).map(o=>o.textContent.trim()):null,
    userOpts: user?Array.from(user.options).map(o=>o.textContent.trim()):null,
  };
});
console.log('MODAL DIAG:', JSON.stringify(modalDiag,null,2));

// Create a TIGHT budget: Lisbon / Transport / Everyone / 10 EUR (transport seed spend ~71.7 EUR -> over).
await page.evaluate(()=>{
  const sel=(id,txtMatch)=>{const e=document.querySelector(id); if(!e)return; const opt=Array.from(e.options).find(o=>o.textContent.includes(txtMatch)); if(opt){e.value=opt.value; e.dispatchEvent(new Event('change',{bubbles:true}));}};
  sel('#newBudTrip','Lisbon');
  sel('#newBudCat','Transport');
  // user stays "all"
  const amt=document.querySelector('#newBudAmt'); amt.value='10'; amt.dispatchEvent(new Event('input',{bubbles:true}));
  sel('#newBudCurr','EUR');
});
await page.locator('button:has-text("Create")').last().click().catch(()=>{});
await page.waitForTimeout(1500);
await page.screenshot({path:`${SHOTS}/p02_budget_over_created.png`, fullPage:true});

const cards = await page.evaluate(()=>Array.from(document.querySelectorAll('.card')).map(c=>c.textContent.replace(/\s+/g,' ').trim()).filter(t=>t.length<300).slice(0,10));
console.log('CARDS AFTER OVER-BUDGET:', JSON.stringify(cards,null,2));

console.log('PAGEERRORS:',JSON.stringify(errors,null,2));
console.log('CONSOLE(non-maps):',JSON.stringify(cerrs.filter(e=>!/google.maps|notifications|Maps|Frankfurter|CORS|ERR_FAILED/.test(e)).slice(0,10),null,2));
await b.close();
