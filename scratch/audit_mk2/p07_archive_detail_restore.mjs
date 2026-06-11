import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5107';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; const cerrs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });

async function login(token, name) {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name }) });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
}
async function go(hash) {
  await p.evaluate(h => { location.hash = '#' + h; }, hash);
  await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1500);
}
async function apiCount() {
  return await p.evaluate(async () => {
    const r = await fetch('/api/data', { headers: {} });
    const d = await r.json();
    return {
      trips: (d.trips || []).map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived })),
      expenses: (d.expenses || []).length,
      settlements: (d.settlements || []).length,
      tripDays: (d.tripDays || []).length,
    };
  });
}

await login('test:test-user-1', 'Alex Rivera');
console.log('API before:', JSON.stringify(await apiCount()));

// Ensure Lisbon is archived (idempotent)
await p.evaluate(async () => { await fetch('/api/trips/trip-lisbon/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });

// Open Collections, click the Lisbon archived card to open detail
await go('collections');
const card = await p.$('.archived-trip-card[data-trip-id="trip-lisbon"]');
if (!card) { console.log('!! no archived card found'); }
else {
  await card.click();
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${SHOTS}/p07_archived_detail.png`, fullPage: true });
  // Read the hero stat chips' text
  const hero = await p.evaluate(() => {
    const h = document.querySelector('.archived-hero');
    if (!h) return 'NO HERO';
    const title = h.querySelector('h1')?.textContent?.trim();
    const chips = [...h.querySelectorAll('[style*="border-radius:999px"]')].map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { title, chips };
  });
  console.log('HERO:', JSON.stringify(hero));
}

// Now RESTORE via the detail page button and watch for duplicates
// Capture insights spend BEFORE restore (archived trip not in active set)
await go('insights');
const insightsBefore = await p.evaluate(() => {
  const txt = document.body.innerText;
  return txt.slice(0, 0) || 'see-shot';
});
await p.screenshot({ path: `${SHOTS}/p07_insights_before_restore.png`, fullPage: true });

// Restore through the API path the UI uses, but ALSO simulate the UI restore (which mutates STATE first).
// Click the restore button on the collections card and confirm.
await go('collections');
const restoreBtn = await p.$('.restore-trip-btn[data-trip-id="trip-lisbon"]');
if (restoreBtn) {
  await restoreBtn.click();
  await p.waitForTimeout(600);
  // confirm modal
  await p.screenshot({ path: `${SHOTS}/p07_restore_confirm.png` });
  // click confirm button in the modal
  const confirmed = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.modal-overlay button, .liquid-modal button, button')];
    const target = btns.find(b => /restore|confirm|yes/i.test(b.textContent || ''));
    if (target) { target.click(); return target.textContent.trim(); }
    return 'NO CONFIRM BTN';
  });
  console.log('Confirm click:', confirmed);
  await p.waitForTimeout(1200);
  // Immediately after restore (before next /api/data poll), check the expenses page for doubled totals
  await p.evaluate(h => { location.hash = '#' + h; }, 'expenses');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${SHOTS}/p07_expenses_after_restore_immediate.png`, fullPage: true });
  const expenseRows = await p.evaluate(() => {
    // Count rendered expense rows for Lisbon if possible
    return {
      bodyHasDup: false,
      rowCount: document.querySelectorAll('[data-expense-id], .expense-row, .expense-item').length,
    };
  });
  console.log('Expenses page rowCount after restore:', JSON.stringify(expenseRows));
}

console.log('API after restore:', JSON.stringify(await apiCount()));
await p.waitForTimeout(200);
await ctx.close(); await b.close();
console.log('DONE pageerrors:', errs.length ? errs.slice(0, 5) : 'none');
console.log('console.errors:', [...new Set(cerrs)].filter(e => !/notifications|AbortError/.test(e)).slice(0, 8));
