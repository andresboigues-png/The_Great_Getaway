import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
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

// === Seed a proper forManual place tied to day-lisbon-1, verify shortlist + places-for-slot ===
await p.evaluate(async () => {
  // fetch current media, add a forManual place, repost
  const r = await fetch('/api/trips/trip-lisbon/media');
  const m = await r.json();
  const places = m.markedPlaces || [];
  places.push({ placeId: 'pid-castelo', name: 'Castelo de Sao Jorge', lat: 38.7139, lng: -9.1335, icon: '🏖️', forManual: true, color: '#0071e3', address: 'R. de Santa Cruz, Lisboa' });
  await fetch('/api/trips/trip-lisbon/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markedPlaces: places }) });
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
// open day 1 detail
const chip = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (chip) { await chip.click(); await p.waitForTimeout(400); }
const detailBtn = await p.$('.day-detail-btn');
if (detailBtn) { await detailBtn.click(); await p.waitForTimeout(800); }
const shortlist = await p.evaluate(() => {
  const cnt = document.querySelector('.day-shortlist-count')?.textContent;
  const rows = [...document.querySelectorAll('.day-shortlist-row')].length;
  return { count: cnt, rows };
});
console.log('SHORTLIST with forManual place:', JSON.stringify(shortlist));
await p.screenshot({ path: `${SHOTS}/p03_shortlist_populated.png` });
// click AM on the place
const amBtn = await p.$('.day-shortlist-add-btn[data-time="morning"]');
if (amBtn) { await amBtn.click(); await p.waitForTimeout(1000); }
const morningAfter = await p.evaluate(() => document.querySelector('textarea.plan-input[data-time="morning"]')?.value);
console.log('Morning after clicking AM on place:', JSON.stringify(morningAfter));
// close
await p.keyboard.press('Escape'); await p.waitForTimeout(800);

// === "Set date" click does nothing test ===
const chip1 = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (chip1) { await chip1.click(); await p.waitForTimeout(400); }
// Try clicking the "Set date" text inside the selected card
const beforeModals = await p.evaluate(() => document.querySelectorAll('.modal-overlay, [class*=modal]').length);
await p.evaluate(() => {
  const card = document.querySelector('.path-card--selected');
  const span = [...(card?.querySelectorAll('span') || [])].find(s => /set date/i.test(s.textContent || ''));
  if (span) span.click();
});
await p.waitForTimeout(600);
const afterModals = await p.evaluate(() => document.querySelectorAll('.modal-overlay, [class*=modal]').length);
console.log('Clicking "Set date": modal count before/after =', beforeModals, '/', afterModals, '(no change = dead text)');

console.log('ERRORS:', errs.slice(0, 4));
await ctx.close(); await b.close();
