import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
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

// Click day chip "1" to select Day 1, then Open Full Plan
async function shot(name) { await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }

// Select day 1 via chip
const chip1 = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (chip1) { await chip1.click(); await p.waitForTimeout(600); }
await shot('p03_path_day1_selected');

// Open Full Plan button (day-detail-btn)
const detailBtn = await p.$('.day-detail-btn');
if (detailBtn) { await detailBtn.click(); await p.waitForTimeout(900); }
await shot('p03_daydetail_modal');

// Report the shortlist count + checklist body text visible
const modalInfo = await p.evaluate(() => {
  const cnt = document.querySelector('.day-shortlist-count');
  const checkRows = [...document.querySelectorAll('#dayChecklistRows .day-checklist-row span')].map(s => s.textContent);
  const morningTa = document.querySelector('textarea.plan-input[data-time="morning"]');
  return {
    shortlistCount: cnt ? cnt.textContent : 'NO COUNT EL',
    checklistRowsText: checkRows,
    morningValue: morningTa ? morningTa.value : 'NO TA',
  };
});
console.log('DAY DETAIL MODAL:', JSON.stringify(modalInfo, null, 1));

// Close
const closeBtn = await p.$('#closeDetailBtn');
if (closeBtn) { await closeBtn.click(); await p.waitForTimeout(400); }

// Open checklist via Anchor checklist btn (need anchor selected). Click star chip
const starChip = await p.$('.path-chip--anchor');
if (starChip) { await starChip.click(); await p.waitForTimeout(500); }
const checklistBtn = await p.$('.path-checklist-btn');
if (checklistBtn) { await checklistBtn.click(); await p.waitForTimeout(800); }
await shot('p03_checklist_modal');
const checklistInfo = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.checklist-item-text')].map(b => ({ text: b.textContent, len: b.textContent.length }));
  return { rowCount: rows.length, rows };
});
console.log('CHECKLIST MODAL:', JSON.stringify(checklistInfo, null, 1));

console.log('pageerrors:', errs.slice(0, 5));
await ctx.close(); await b.close();
