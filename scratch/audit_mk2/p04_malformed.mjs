// p04 — test malformed itinerary handling + 1-day happy path + edge UX
import { chromium } from 'playwright';
const PORT = 5104; const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';
const pageErrors = [];

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) });
    localStorage.setItem('gg_auth_token', 'x');
  });
  await page.evaluate(() => { location.hash = '#home'; });
  await page.reload({ waitUntil: 'networkidle' });
}
async function gotoAI(page) {
  await page.evaluate(() => { if (location.hash === '#ai') location.hash = '#home'; location.hash = '#ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForFunction(() => !!document.querySelector('#aiControlsPanel') || /Plan with AI/i.test(document.querySelector('h1')?.textContent || ''), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await login(page);

  // --- TEST A: malformed itinerary = object with "days" key (model sometimes does this) ---
  await page.route('**/api/generate_itinerary', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'success',
      host_keys: { total: 6, exhausted: 0, available: 6 },
      itinerary: { days: [ { day: 1, title: 'Wrapped in object', breakfast: { text: 'Cafe', name: 'Cafe' } } ] },
    }) });
  });
  await gotoAI(page);
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo');
    if (f) { f.value = '2026-06-01'; f.dispatchEvent(new Event('input', { bubbles: true })); }
    if (t) { t.value = '2026-06-02'; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  const beforeA = pageErrors.length;
  const gen = await page.$('.ai-generate-btn');
  if (gen) { await gen.click(); await page.waitForTimeout(2500); }
  await page.screenshot({ path: `${SHOTS}/p04_A_dict_itinerary.png`, fullPage: true });
  const crashedA = await page.evaluate(() => /Something broke on this page/i.test(document.body.innerText));
  console.log('TEST A (itinerary={days:[...]}):  pageErrorsAdded=', pageErrors.length - beforeA, ' fullPageCrash=', crashedA);
  console.log('  errs:', pageErrors.slice(beforeA).join(' | ') || '(none)');

  await page.unroute('**/api/generate_itinerary');

  // --- TEST B: itinerary = null  ---
  await page.route('**/api/generate_itinerary', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', itinerary: null, host_keys: { total: 6, exhausted: 0, available: 6 } }) });
  });
  await login(page); await gotoAI(page);
  await page.evaluate(() => { const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo'); if (f){f.value='2026-06-01';f.dispatchEvent(new Event('input',{bubbles:true}));} if(t){t.value='2026-06-02';t.dispatchEvent(new Event('input',{bubbles:true}));} });
  const beforeB = pageErrors.length;
  const genB = await page.$('.ai-generate-btn'); if (genB) { await genB.click(); await page.waitForTimeout(2000); }
  const crashedB = await page.evaluate(() => /Something broke on this page/i.test(document.body.innerText));
  console.log('TEST B (itinerary=null): pageErrorsAdded=', pageErrors.length - beforeB, ' fullPageCrash=', crashedB);
  await page.unroute('**/api/generate_itinerary');

  // --- TEST C: itinerary = a JSON string (not array/obj) e.g. a plain string ---
  await page.route('**/api/generate_itinerary', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', itinerary: 'just a sentence', host_keys: { total: 6, exhausted: 0, available: 6 } }) });
  });
  await login(page); await gotoAI(page);
  await page.evaluate(() => { const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo'); if (f){f.value='2026-06-01';f.dispatchEvent(new Event('input',{bubbles:true}));} if(t){t.value='2026-06-02';t.dispatchEvent(new Event('input',{bubbles:true}));} });
  const beforeC = pageErrors.length;
  const genC = await page.$('.ai-generate-btn'); if (genC) { await genC.click(); await page.waitForTimeout(2000); }
  const crashedC = await page.evaluate(() => /Something broke on this page/i.test(document.body.innerText));
  console.log('TEST C (itinerary="string"): pageErrorsAdded=', pageErrors.length - beforeC, ' fullPageCrash=', crashedC);
  console.log('  errs:', pageErrors.slice(beforeC).join(' | ') || '(none)');
  await page.unroute('**/api/generate_itinerary');

  // --- TEST D: 429 quota drained — does BYO panel auto-open? ---
  await page.route('**/api/generate_itinerary', (route) => {
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: "Today's shared AI quota is fully booked. Add your own Gemini API key (free for personal use) to keep generating.", host_keys: { total: 6, exhausted: 6, available: 0 } }) });
  });
  await login(page); await gotoAI(page);
  await page.evaluate(() => { const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo'); if (f){f.value='2026-06-01';f.dispatchEvent(new Event('input',{bubbles:true}));} if(t){t.value='2026-06-02';t.dispatchEvent(new Event('input',{bubbles:true}));} });
  const genD = await page.$('.ai-generate-btn'); if (genD) { await genD.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: `${SHOTS}/p04_D_quota_drained.png`, fullPage: true });
  const stateD = await page.evaluate(() => ({
    byoOpen: !!document.querySelector('input[type="password"], input[placeholder*="Gemini"]'),
    bar: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    barColor: getComputedStyle(document.querySelector('[role="progressbar"]>div') || document.body).background,
    errCard: /quota|fully booked|Daily AI/i.test(document.body.innerText),
  }));
  console.log('TEST D (429 drained): ', JSON.stringify(stateD));
  await page.unroute('**/api/generate_itinerary');

  console.log('\nALL PAGE ERRORS:\n', pageErrors.join('\n') || '(none)');
  await browser.close();
};
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
