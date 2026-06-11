// p02 UI flows: manual expense add (weird date, emoji, double-submit),
// then verify History + Insights render. Robust nav via waiting for H1.
import { chromium } from 'playwright';

const PORT = 5102;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';
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

// Navigate by setting hash twice (defeats isInternalNav swallow) + wait.
async function navTo(page, hash, expectText) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate((h) => { window.location.hash = ''; }, hash);
    await page.waitForTimeout(60);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await page.waitForTimeout(700);
    const ok = await page.locator(`text=${expectText}`).first().count().catch(() => 0);
    if (ok) return true;
  }
  return false;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await login(page);

// Go to Expenses via the top nav link (reliable).
await page.locator('nav >> text=Expenses').first().click().catch(()=>{});
await page.waitForTimeout(1200);
let url = await page.evaluate(() => location.hash);
console.log('after Expenses click, hash =', url);
await page.screenshot({ path: `${SHOTS}/p02_exp_landing.png` });

// Confirm the manual form is visible (Upload tab default).
const haveForm = await page.locator('#expValue').count();
console.log('manual #expValue present:', haveForm);

if (haveForm) {
  // Inspect category + currency option lists.
  const diag = await page.evaluate(() => {
    const cat = document.querySelector('#expCategory');
    const cur = document.querySelector('#expCurrency');
    const who = document.querySelector('#expWho');
    return {
      cats: cat ? Array.from(cat.options).map(o=>`${o.value}:${o.textContent.trim()}`) : null,
      currCount: cur ? cur.options.length : null,
      currHead: cur ? Array.from(cur.options).slice(0,8).map(o=>o.value) : null,
      whos: who ? Array.from(who.options).map(o=>o.value) : null,
    };
  });
  console.log('FORM DIAG:', JSON.stringify(diag));

  // Fill the form with an EMOJI label + a WEIRD future date, value with many decimals.
  await page.fill('#expLabel', '🍕 weird-date test 🎉');
  await page.fill('#expValue', '12.349');
  // date input: set far-future date
  await page.evaluate(() => {
    const d = document.querySelector('#expDate');
    if (d) { d.value = '2099-12-31'; d.dispatchEvent(new Event('change', {bubbles:true})); }
  });
  // pick first category + currency EUR + who (first)
  await page.evaluate(() => {
    const sel = (id, val) => { const e = document.querySelector(id); if (e && val!=null){ e.value=val; e.dispatchEvent(new Event('change',{bubbles:true})); } };
    const cat = document.querySelector('#expCategory'); if (cat && cat.options.length) sel('#expCategory', cat.options[0].value);
    sel('#expCurrency','EUR');
    const who = document.querySelector('#expWho'); if (who && who.options.length) sel('#expWho', who.options[0].value);
  });
  await page.screenshot({ path: `${SHOTS}/p02_exp_form_filled.png` });

  // RAPID DOUBLE SUBMIT: click Save twice fast.
  const saveBtn = page.locator('button[type=submit]:has-text("Save Expense")').first();
  await saveBtn.click();
  await saveBtn.click().catch(()=>{});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/p02_exp_after_submit.png` });

  // Count how many expenses now exist via API to detect double-add.
  const count = await page.evaluate(async () => {
    const r = await fetch('/api/data', { headers: { Authorization: 'Bearer ' + (window.__t||'') } });
    return 'n/a';
  });
}

// History tab — click the History sub-tab.
await page.locator('text=History').first().click().catch(()=>{});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SHOTS}/p02_history_after.png`, fullPage: true });
const histRows = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.expense-row')).map(r => r.textContent.replace(/\s+/g,' ').trim()).slice(0,15);
});
console.log('HISTORY ROWS:', JSON.stringify(histRows, null, 2));

// Insights tab.
await page.locator('.expenses-tabnav__tab:has-text("Insights"), text=Insights').first().click().catch(()=>{});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/p02_insights_after.png`, fullPage: true });
const ins = await page.evaluate(() => {
  const cur = document.querySelector('#insightCurrencySelector');
  return {
    currOptions: cur ? Array.from(cur.options).map(o=>o.value) : null,
    hero: document.querySelector('.hero-stat-card__value')?.textContent?.trim(),
    avgDaily: document.querySelector('.metric-value')?.textContent?.trim(),
    timelineLabels: (window.__lastTimelineLabels||null),
  };
});
console.log('INSIGHTS DIAG:', JSON.stringify(ins, null, 2));

console.log('\nPAGEERRORS:', JSON.stringify(errors,null,2));
console.log('CONSOLE ERRORS:', JSON.stringify(cerrs.filter(e=>!e.includes('google.maps')&&!e.includes('notifications')&&!e.includes('Maps')).slice(0,20),null,2));
await browser.close();
