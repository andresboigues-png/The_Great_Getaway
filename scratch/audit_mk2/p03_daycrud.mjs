import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
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
async function shot(name) { await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }
async function chips() {
  return p.evaluate(() => [...document.querySelectorAll('.path-chip[data-path-chip-day-id]')].map(c => ({ id: c.dataset.pathChipDayId, label: c.textContent.trim() })));
}
async function tokyoDays() {
  return p.evaluate(() => {
    return fetch('/api/data', { headers: { Authorization: 'Bearer ' + (window.localStorage.getItem('x') || '') } }).then(() => null).catch(() => null);
  });
}

await login();

// Switch to Tokyo trip (smaller, private) via tripSelector. Use the trip switcher.
// Easier: directly set activeTripId via a click on the trip dropdown is complex; instead use API check after.
// We'll operate on Lisbon (already active). Record initial chips.
console.log('INITIAL chips:', JSON.stringify(await chips()));

// === TEST 1: Add a day via the + chip ===
const addChip = await p.$('#pathAddDayChip');
if (!addChip) { console.log('NO ADD CHIP (not editable?)'); }
else {
  await addChip.click();
  await p.waitForTimeout(700);
  await shot('p03_adday_modal');
  // The modal pre-fills name "Day 5" and a suggested date. Check date field.
  const addInfo = await p.evaluate(() => {
    const nm = document.querySelector('#dayName');
    const dt = document.querySelector('#dayDate');
    return { name: nm ? nm.value : 'NONE', date: dt ? dt.value : 'NONE', dateRequired: dt ? dt.required : null };
  });
  console.log('ADD-DAY MODAL prefill:', JSON.stringify(addInfo));
  // Try submitting with EMPTY date (clear it) to see if required blocks
  await p.evaluate(() => { const dt = document.querySelector('#dayDate'); if (dt) dt.value=''; });
  await p.evaluate(() => { const nm = document.querySelector('#dayName'); if (nm) nm.value='My Custom Day Name'; });
  // set a date well BEFORE day 1's date region (no dates set on seed, so any date)
  await p.evaluate(() => { const dt = document.querySelector('#dayDate'); if (dt) dt.value='2026-06-20'; });
  const submitBtn = await p.$('#addDayForm button[type="submit"]');
  if (submitBtn) { await submitBtn.click(); await p.waitForTimeout(1500); }
}
console.log('After ADD chips:', JSON.stringify(await chips()));
await shot('p03_after_add_day');

// === TEST 2: Delete a middle day (Day 2) and check renumber ===
// select day 2
const chip2 = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-2"]');
if (chip2) { await chip2.click(); await p.waitForTimeout(500); }
const delBtn = await p.$('.day-delete-btn');
if (delBtn) {
  await delBtn.click();
  await p.waitForTimeout(700);
  await shot('p03_delete_confirm');
  // Confirm in the confirm modal
  const confirmBtn = await p.$('.confirm-modal-confirm, [data-confirm], button:has-text("Delete")');
  // Find confirm button text
  const confirmTextBtn = await p.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.find(b => /delete/i.test(b.textContent) && b.offsetParent !== null && !b.className.includes('day-delete-btn'));
  });
  const el = confirmTextBtn.asElement();
  if (el) { await el.click(); await p.waitForTimeout(2000); }
}
console.log('After DELETE day 2, chips:', JSON.stringify(await chips()));
await shot('p03_after_delete_day2');

// Verify server state for lisbon days
const serverDays = await p.evaluate(async () => {
  const r = await fetch('/api/data');
  const d = await r.json();
  return (d.tripDays || []).filter(x => x.tripId === 'trip-lisbon').map(x => ({ id: x.id, n: x.dayNumber, name: x.name, date: x.date })).sort((a,b)=>a.n-b.n);
});
console.log('SERVER lisbon days after ops:', JSON.stringify(serverDays, null, 1));

console.log('ERRORS:', errs.slice(0, 8));
await ctx.close(); await b.close();
