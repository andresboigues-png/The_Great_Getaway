import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();

// ---- MOBILE 390px ----
const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await mctx.newPage();
const merr = [];
mp.on('pageerror', e => merr.push(e.message));
async function mlogin() {
  await mp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await mp.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await mp.evaluate(() => { location.hash = '#home'; });
  await mp.reload({ waitUntil: 'networkidle' });
  await mp.waitForTimeout(2800);
}
await mlogin();
await mp.screenshot({ path: `${SHOTS}/p03_mobile_home.png`, fullPage: false });
// scroll to the path tab / day cards
await mp.evaluate(() => { const el = document.querySelector('#pathTabInner'); if (el) el.scrollIntoView(); });
await mp.waitForTimeout(600);
await mp.screenshot({ path: `${SHOTS}/p03_mobile_pathtab.png`, fullPage: false });
// Select day 1, screenshot the day card
const mchip = await mp.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (mchip) { await mchip.click(); await mp.waitForTimeout(700); }
await mp.evaluate(() => { const el = document.querySelector('#pathTabInner'); if (el) el.scrollIntoView(); });
await mp.waitForTimeout(400);
await mp.screenshot({ path: `${SHOTS}/p03_mobile_day1card.png`, fullPage: false });
// Open full plan on mobile
const mdetail = await mp.$('.day-detail-btn');
if (mdetail) { await mdetail.click(); await mp.waitForTimeout(900); }
await mp.screenshot({ path: `${SHOTS}/p03_mobile_daydetail.png`, fullPage: false });
// measure horizontal overflow
const overflow = await mp.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  winW: window.innerWidth,
  overflowX: document.documentElement.scrollWidth - window.innerWidth,
}));
console.log('MOBILE overflow:', JSON.stringify(overflow));
console.log('MOBILE pageerrors:', merr.slice(0, 4));
await mctx.close();

// ---- TWO-CONTEXT DESYNC TEST ----
// Context A and B both as Alex. A edits day-lisbon-1 morning; B (loaded before) edits same; check stale handling.
const a = await b.newContext({ viewport: { width: 1100, height: 800 } });
const pa = await a.newPage();
const b2 = await b.newContext({ viewport: { width: 1100, height: 800 } });
const pb = await b2.newPage();
async function loginPage(pg) {
  await pg.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pg.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await pg.evaluate(() => { location.hash = '#home'; });
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForTimeout(2500);
}
await loginPage(pa); await loginPage(pb);
// Both open day-lisbon-1 detail
async function openDayDetail(pg) {
  const chip = await pg.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
  if (chip) { await chip.click(); await pg.waitForTimeout(400); }
  const d = await pg.$('.day-detail-btn');
  if (d) { await d.click(); await pg.waitForTimeout(700); }
}
await openDayDetail(pa); await openDayDetail(pb);
// A types + saves
await pa.evaluate(() => { const ta = document.querySelector('textarea.plan-input[data-time="evening"]'); if (ta) { ta.value = 'EDIT_FROM_A'; ta.dispatchEvent(new Event('input', { bubbles: true })); } });
await pa.waitForTimeout(1500);
// B types + saves (stale — B's updatedAt is older)
await pb.evaluate(() => { const ta = document.querySelector('textarea.plan-input[data-time="evening"]'); if (ta) { ta.value = 'EDIT_FROM_B_STALE'; ta.dispatchEvent(new Event('input', { bubbles: true })); } });
await pb.waitForTimeout(1800);
const bStatus = await pb.evaluate(() => document.querySelector('#autosaveStatus')?.textContent);
console.log('B autosave status (stale edit):', bStatus);
// What did the server end up with?
const final = await pa.evaluate(async () => {
  const r = await fetch('/api/data'); const d = await r.json();
  const day = (d.tripDays || []).find(x => x.id === 'day-lisbon-1');
  return day?.plan?.evening;
});
console.log('SERVER evening after A then B:', JSON.stringify(final));
await a.close(); await b2.close();
await b.close();
