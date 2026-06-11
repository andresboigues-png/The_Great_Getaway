import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
async function login() {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await p.evaluate(() => { location.hash = '#home'; });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
}
await login();

// Day 3 ("Markets & Departure" now Day 2 after earlier delete... use day-lisbon-3 which is now n=2)
// Actually use day-lisbon-1 to keep clean. Open it.
const DAYID = 'day-lisbon-1';
async function openDay(id) {
  const chip = await p.$(`.path-chip[data-path-chip-day-id="${id}"]`);
  if (chip) { await chip.click(); await p.waitForTimeout(400); }
  const detailBtn = await p.$('.day-detail-btn');
  if (detailBtn) { await detailBtn.click(); await p.waitForTimeout(800); }
}
await openDay(DAYID);
const NOTE = 'MY_PERSONAL_NOTE_' + Date.now();
await p.evaluate((n) => {
  const ta = document.querySelector('#detailNotes');
  if (ta) { ta.value = n; ta.dispatchEvent(new Event('input', { bubbles: true })); }
}, NOTE);
await p.waitForTimeout(1600);
const status = await p.evaluate(() => document.querySelector('#autosaveStatus')?.textContent);
console.log('Autosave status:', status);
// Click "Done" to explicitly save+close
const doneBtn = await p.$('#saveDetailBtn');
if (doneBtn) { await doneBtn.click(); await p.waitForTimeout(1500); }

// Now FULL RELOAD (fresh pull from server)
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await openDay(DAYID);
const reopened = await p.evaluate(() => {
  const ta = document.querySelector('#detailNotes');
  return ta ? ta.value : 'NO TA';
});
console.log('NOTE TYPED:', NOTE);
console.log('NOTE AFTER RELOAD+REOPEN:', JSON.stringify(reopened));
console.log('NOTE SURVIVED?', reopened === NOTE ? 'YES' : 'NO -- DATA LOSS');
console.log('ERRORS:', errs.slice(0, 4));
await ctx.close(); await b.close();
