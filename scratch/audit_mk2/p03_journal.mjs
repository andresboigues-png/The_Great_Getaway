import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5103';
const SHOTS = 'scratch/audit_mk2/shots';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
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
// Open Journaling on Day 1
const chip = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (chip) { await chip.click(); await p.waitForTimeout(400); }
const jBtn = await p.$('.day-journaling-btn');
if (jBtn) { await jBtn.click(); await p.waitForTimeout(700); }
await p.screenshot({ path: `${SHOTS}/p03_journal_modal.png` });
const JNOTE = 'JOURNAL_ENTRY_' + Date.now();
await p.evaluate((n) => {
  const ta = document.querySelector('#journalText');
  if (ta) ta.value = n;
}, JNOTE);
const saveBtn = await p.$('#saveJournalBtn');
if (saveBtn) { await saveBtn.click(); await p.waitForTimeout(1500); }
// reload + reopen
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const chip2 = await p.$('.path-chip[data-path-chip-day-id="day-lisbon-1"]');
if (chip2) { await chip2.click(); await p.waitForTimeout(400); }
const jBtn2 = await p.$('.day-journaling-btn');
if (jBtn2) { await jBtn2.click(); await p.waitForTimeout(700); }
const after = await p.evaluate(() => document.querySelector('#journalText')?.value);
console.log('JOURNAL TYPED:', JNOTE);
console.log('JOURNAL AFTER RELOAD:', JSON.stringify(after));
console.log('SURVIVED?', after === JNOTE ? 'YES' : 'NO -- DATA LOSS');
// Check DB
const dbCheck = await p.evaluate(async () => {
  const r = await fetch('/api/data'); const d = await r.json();
  const day = (d.tripDays || []).find(x => x.id === 'day-lisbon-1');
  return { notes: day?.notes, tip: day?.tip };
});
console.log('day-lisbon-1 notes/tip in /api/data:', JSON.stringify(dbCheck));
await ctx.close(); await b.close();
