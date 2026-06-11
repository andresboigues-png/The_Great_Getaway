// p04 — prove the 20s apiFetch cap aborts a still-valid generation
import { chromium } from 'playwright';
const PORT = 5104; const BASE = `http://127.0.0.1:${PORT}`;

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await login(page);

  // Run the SAME fetch the AI page runs, but measure how it ends.
  // apiFetch isn't exposed globally, so replicate its 20s AbortSignal.timeout.
  const r = await page.evaluate(async () => {
    const t0 = performance.now();
    const ctrl = AbortSignal.timeout(20000); // mirrors api.ts:185
    try {
      const res = await fetch('/api/generate_itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: ctrl,
        body: JSON.stringify({ destination: 'Lisbon', numDays: 3, dateFrom: '2026-08-01', dateTo: '2026-08-03', foodContext: 'seafood', sightseeingContext: 'museums' }),
      });
      const ms = Math.round(performance.now() - t0);
      const body = await res.json();
      return { ok: true, status: res.status, ms, days: Array.isArray(body.itinerary) ? body.itinerary.length : 'n/a' };
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      return { ok: false, ms, err: String(e?.name || e) };
    }
  });
  console.log('IN-BROWSER 3-day generate (20s cap):', JSON.stringify(r));

  // Now do the SAME with NO cap to show the server would have succeeded.
  const r2 = await page.evaluate(async () => {
    const t0 = performance.now();
    try {
      const res = await fetch('/api/generate_itinerary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ destination: 'Lisbon', numDays: 3, dateFrom: '2026-08-01', dateTo: '2026-08-03', foodContext: 'seafood', sightseeingContext: 'museums' }),
      });
      const ms = Math.round(performance.now() - t0);
      const body = await res.json();
      return { status: res.status, ms, days: Array.isArray(body.itinerary) ? body.itinerary.length : 'n/a' };
    } catch (e) { return { err: String(e), ms: Math.round(performance.now() - t0) }; }
  });
  console.log('IN-BROWSER 3-day generate (NO cap):  ', JSON.stringify(r2));

  await browser.close();
};
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
