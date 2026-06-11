// p04 — empty-trip "Plan with AI" view for a brand-new user (no trips)
import { chromium } from 'playwright';
const PORT = 5104; const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';
const pageErrors = [];

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Log in as Alex, then force the "no active trip" code path
  // (EmptyTripView) by clearing the active trip + trips list in STATE.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await page.evaluate(() => { location.hash = '#home'; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Clear active trip so useActiveTrip() returns null → EmptyTripView.
  await page.evaluate(() => {
    const w = window;
    if (w.STATE) {
      w.STATE.activeTripId = null;
      w.STATE.currentTripId = null;
      // do NOT wipe trips on the server — just hide them client-side
      w.STATE.trips = [];
      w.emit?.('state:changed');
    }
  });

  // go to AI
  await page.evaluate(() => { location.hash = '#ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForFunction(() => !!document.querySelector('#emptyMap') || /Ready for a new adventure|Plan with AI/i.test(document.body.innerText), { timeout: 8000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/p04_E1_empty_trip.png`, fullPage: true });

  const r = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim(),
    h2: document.querySelector('h2')?.textContent?.trim(),
    body: [...document.querySelectorAll('p')].map(p=>p.textContent.trim()).filter(Boolean).slice(0,3),
    cta: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,5),
    hasMap: !!document.querySelector('#emptyMap'),
    hasGenerate: !!document.querySelector('.ai-generate-btn'),
    hasDateInputs: !!document.querySelector('#aiDateFrom'),
    crash: /Something broke/i.test(document.body.innerText),
  }));
  console.log('EMPTY-TRIP AI VIEW:', JSON.stringify(r, null, 2));
  console.log('\nPAGE ERRORS:', pageErrors.join(' | ') || '(none)');
  await browser.close();
};
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
