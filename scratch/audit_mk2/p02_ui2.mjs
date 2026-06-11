import { chromium } from 'playwright';
const PORT = 5102, BASE = `http://127.0.0.1:${PORT}`, SHOTS = 'scratch/audit_mk2/shots';
const errors = [], cerrs = [];

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await login(page);

await page.locator('nav >> text=Expenses').first().click();
await page.waitForTimeout(1200);

// Fill a VALID expense and DOUBLE-SUBMIT to test idempotency.
await page.fill('#expLabel', 'Double submit test');
await page.fill('#expValue', '25.00');
await page.evaluate(() => {
  const sel = (id,v)=>{const e=document.querySelector(id); if(e){e.value=v; e.dispatchEvent(new Event('change',{bubbles:true}));}};
  sel('#expCategory', document.querySelector('#expCategory').options[0].value);
  sel('#expCurrency','EUR');
  sel('#expWho', document.querySelector('#expWho').options[0].value);
  const d=document.querySelector('#expDate'); d.value='2026-06-20'; d.dispatchEvent(new Event('change',{bubbles:true}));
});
const save = page.locator('button[type=submit]:has-text("Save Expense")').first();
await Promise.all([ save.click(), save.click().catch(()=>{}) ]);
await page.waitForTimeout(500);
// try a 3rd rapid click
await save.click().catch(()=>{});
await page.waitForTimeout(2000);

// Count "Double submit test" rows via History.
await page.locator('.expenses-tabnav__tab:has-text("History")').first().click();
await page.waitForTimeout(1200);
const dupCount = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.expense-row'));
  return rows.filter(r => r.textContent.includes('Double submit test')).length;
});
console.log('DOUBLE-SUBMIT: rows matching "Double submit test" =', dupCount, '(expect 1)');

// Now inject a bad-date expense via API and a valid far-future one, then view Insights.
await page.evaluate(async () => {
  const tok = (await (await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test:test-user-1',name:'Alex'})})).json()).token;
  window.__tok = tok;
  const H = { Authorization:'Bearer '+tok, 'Content-Type':'application/json' };
  const mk = (o) => ({ id:'bd-'+Math.random().toString(36).slice(2,10), tripId:'trip-lisbon', who:'Alex', categoryId:'food', currency:'EUR', ...o });
  await fetch('/api/expenses',{method:'POST',headers:H,body:JSON.stringify({expense: mk({label:'BAD DATE EXP', value:77, date:'not-a-date-99999'})})});
  await fetch('/api/expenses',{method:'POST',headers:H,body:JSON.stringify({expense: mk({label:'EMPTY DATE EXP', value:88, date:''})})});
});
// reload to pull fresh data
await page.reload({ waitUntil:'networkidle' });
await page.waitForTimeout(1500);
await page.locator('nav >> text=Expenses').first().click();
await page.waitForTimeout(1000);
// Insights sub-tab
await page.locator('.expenses-tabnav__tab:has-text("Insights")').first().click();
await page.waitForTimeout(1800);
await page.screenshot({ path: `${SHOTS}/p02_insights_baddate.png`, fullPage: true });
const ins = await page.evaluate(() => {
  const cur = document.querySelector('#insightCurrencySelector');
  return {
    insightCurrCount: cur ? cur.options.length : null,
    insightCurrs: cur ? Array.from(cur.options).map(o=>o.value) : null,
    hero: document.querySelector('.hero-stat-card__value')?.textContent?.trim(),
    avgDaily: Array.from(document.querySelectorAll('.metric-value')).map(e=>e.textContent.trim()),
  };
});
console.log('INSIGHTS:', JSON.stringify(ins, null, 2));

// History — find the bad-date rows' rendered date text.
await page.locator('.expenses-tabnav__tab:has-text("History")').first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/p02_history_baddate.png`, fullPage: true });
const baddate = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.expense-row'))
    .filter(r => /BAD DATE|EMPTY DATE/.test(r.textContent))
    .map(r => r.textContent.replace(/\s+/g,' ').trim());
});
console.log('BAD-DATE HISTORY ROWS:', JSON.stringify(baddate, null, 2));

console.log('\nPAGEERRORS:', JSON.stringify(errors,null,2));
console.log('CONSOLE(non-maps):', JSON.stringify(cerrs.filter(e=>!/google.maps|notifications|Maps/.test(e)).slice(0,15),null,2));
await browser.close();
