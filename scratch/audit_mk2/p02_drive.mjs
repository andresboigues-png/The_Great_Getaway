// p02 — money/budgets/insights driver. Logs in as Alex, walks expenses,
// budgets, insights. Screenshots key states. Captures console + pageerror.
import { chromium } from 'playwright';

const PORT = 5102;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';

const errors = [];
const consoleErrs = [];

async function login(page, token = 'test:test-user-1', name = 'Alex Rivera') {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name }),
    });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
  await page.evaluate(() => { location.hash = '#home'; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(900);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('pageerror', (e) => { errors.push(String(e)); });

await login(page);

// Ensure active trip = Lisbon
await page.evaluate(() => {
  // STATE is not global; set activeTripId via localStorage-ish? Use the app's trip tabs instead.
});

// HOME: pick Lisbon trip if a trip selector exists
await go(page, '#home');
await page.screenshot({ path: `${SHOTS}/p02_home.png`, fullPage: false });

// EXPENSES
await go(page, '#expenses');
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/p02_expenses_manual.png`, fullPage: true });

// Read active trip + categories from the running app for diagnostics
const diag = await page.evaluate(() => {
  // Try to reach STATE via the module graph isn't possible; read DOM instead.
  const catSel = document.querySelector('#expCategory');
  const cats = catSel ? Array.from(catSel.options).map(o => `${o.value}:${o.textContent.trim()}`) : null;
  const currSel = document.querySelector('#expCurrency');
  const currs = currSel ? Array.from(currSel.options).map(o => o.value).slice(0, 30) : null;
  const whoSel = document.querySelector('#expWho');
  const whos = whoSel ? Array.from(whoSel.options).map(o => o.value) : null;
  return { cats, currs, whos };
});
console.log('EXPENSE FORM DIAG:', JSON.stringify(diag, null, 2));

// HISTORY tab
const histBtn = page.locator('text=/History/i').first();
if (await histBtn.count()) { await histBtn.click().catch(()=>{}); await page.waitForTimeout(700); }
await page.screenshot({ path: `${SHOTS}/p02_expenses_history.png`, fullPage: true });

// BUDGETS
await go(page, '#budgets');
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/p02_budgets.png`, fullPage: true });

const budgetDiag = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.card')).map(c => c.textContent.replace(/\s+/g,' ').trim()).filter(t => t.length < 400);
  return cards.slice(0, 12);
});
console.log('BUDGET CARDS:', JSON.stringify(budgetDiag, null, 2));

// INSIGHTS
await go(page, '#insights');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/p02_insights.png`, fullPage: true });

const insightsDiag = await page.evaluate(() => {
  const currSel = document.querySelector('#insightCurrencySelector');
  const currs = currSel ? Array.from(currSel.options).map(o => o.value) : null;
  const hero = document.querySelector('.hero-stat-card__value')?.textContent?.trim();
  return { insightCurrencyOptions: currs, hero };
});
console.log('INSIGHTS DIAG:', JSON.stringify(insightsDiag, null, 2));

console.log('\n=== PAGEERRORS ===', JSON.stringify(errors, null, 2));
console.log('=== CONSOLE ERRORS ===', JSON.stringify(consoleErrs.slice(0, 30), null, 2));

await browser.close();
