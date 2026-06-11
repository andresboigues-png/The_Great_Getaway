import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5112';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await p.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex' }) }); localStorage.setItem('gg_auth_token', 'x'); });
await p.evaluate(() => { location.hash = '#settlement'; });
await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
await p.waitForTimeout(2500);
const txt = await p.evaluate(() => document.body.innerText);
const hasPhantom = /Sara Lopez/.test(txt);          // phantom duplicate person
const people = ['Alex', 'Sara', 'Tom'].filter(n => new RegExp(`\\b${n}\\b`).test(txt));
console.log('phantom "Sara Lopez" present:', hasPhantom, '(want false)');
console.log('balance people seen:', people.join(', '));
// History tab
await p.locator('text=/History/i').first().click().catch(() => {});
await p.waitForTimeout(1200);
const histTxt = await p.evaluate(() => document.body.innerText);
const histEmpty = /No past settlements/i.test(histTxt);
console.log('History shows "No past settlements":', histEmpty, '(want false — the €45 should be listed)');
await p.screenshot({ path: 'scratch/audit_mk2/shots/_verify_bug4.png' }).catch(() => {});
await ctx.close(); await b.close();
