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
await login();

// === TEST: autosave on day detail ===
// Select Day 1
const chip1 = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (chip1) { await chip1.click(); await p.waitForTimeout(400); }
const detailBtn = await p.$('.day-detail-btn');
if (detailBtn) { await detailBtn.click(); await p.waitForTimeout(800); }
// Type into morning textarea
const UNIQ = 'AUTOSAVE_PROBE_' + Date.now();
await p.evaluate((u) => {
  const ta = document.querySelector('textarea.plan-input[data-time="morning"]');
  if (ta) { ta.value = u; ta.dispatchEvent(new Event('input', { bubbles: true })); }
}, UNIQ);
// Also type personal notes
await p.evaluate((u) => {
  const ta = document.querySelector('#detailNotes');
  if (ta) { ta.value = 'NOTE_' + u; ta.dispatchEvent(new Event('input', { bubbles: true })); }
}, UNIQ);
await p.waitForTimeout(1500); // wait for 700ms debounce + network
// Read autosave status
const status1 = await p.evaluate(() => { const s = document.querySelector('#autosaveStatus'); return s ? s.textContent : 'NONE'; });
console.log('Autosave status after typing+wait:', status1);
// Close via Esc to test flush-on-close
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);

// Verify server has the morning value
const serverMorning = await p.evaluate(async () => {
  const r = await fetch('/api/data'); const d = await r.json();
  const day = (d.tripDays || []).find(x => x.id === 'day-lisbon-1');
  return day ? { morning: day.morning, tip: day.tip } : null;
});
console.log('SERVER day-lisbon-1 after autosave+Esc:', JSON.stringify(serverMorning));

// === TEST: "Set date" text — is it clickable to set a date? ===
// Select day 1 (no date on seed). Click the calendar/Set date span in the selected card.
const setDateClickable = await p.evaluate(() => {
  // Find the selected path card and any element with "Set date" text
  const cards = [...document.querySelectorAll('.path-card--selected')];
  const card = cards[0];
  if (!card) return { found: false };
  const spans = [...card.querySelectorAll('span')];
  const setDateSpan = spans.find(s => /set date/i.test(s.textContent || ''));
  if (!setDateSpan) return { found: false, cardText: card.textContent.slice(0, 80) };
  // Is it inside a button/anchor or have a click handler / cursor pointer?
  const style = getComputedStyle(setDateSpan);
  const inButton = !!setDateSpan.closest('button, a, [role=button]');
  return { found: true, cursor: style.cursor, inButton, text: setDateSpan.textContent };
});
console.log('SET DATE affordance:', JSON.stringify(setDateClickable));

console.log('ERRORS:', errs.slice(0, 6));
await ctx.close(); await b.close();
