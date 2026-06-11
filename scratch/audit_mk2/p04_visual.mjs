// p04 — visual audit of a SUCCESSFUL itinerary render + accept + to-do panel
// Stubs generate_itinerary with a REAL enriched response so we can see the UI
// that the 20s timeout normally prevents us from reaching.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const PORT = 5104; const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';
const stub = readFileSync('scratch/audit_mk2/_stub_itin.json', 'utf8');
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
  await page.waitForTimeout(900);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 1600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('**/api/generate_itinerary', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: stub }));
  await login(page);
  await gotoAI(page);
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo');
    if (f) { f.value = '2026-07-10'; f.dispatchEvent(new Event('input', { bubbles: true })); }
    if (t) { t.value = '2026-07-10'; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await (await page.$('.ai-generate-btn')).click();
  await page.waitForFunction(() => document.querySelectorAll('.ai-day-row').length > 0 || /Something broke/i.test(document.body.innerText), { timeout: 8000 }).catch(()=>{});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/p04_V1_itinerary_render.png`, fullPage: true });
  const r = await page.evaluate(() => ({
    dayRows: document.querySelectorAll('.ai-day-row').length,
    placeCards: document.querySelectorAll('.ai-place-card').length,
    mealBlocks: document.querySelectorAll('.ai-plan-block').length,
    sightsItems: document.querySelectorAll('.ai-plan-block').length,
    crash: /Something broke/i.test(document.body.innerText),
    resultHeading: [...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).find(t=>/Itinerary/.test(t)),
  }));
  console.log('VISUAL RENDER:', JSON.stringify(r, null, 2));

  // Accept the plan
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(b=>/Accept Plan/i.test(b.textContent||'')); b?.click(); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/p04_V2_after_accept.png`, fullPage: true });
  const todo = await page.evaluate(() => ({
    markedCards: document.querySelectorAll('.ai-marked-card').length,
    panelTitles: [...document.querySelectorAll('h3')].map(h=>h.textContent.trim()),
    acceptBtn: [...document.querySelectorAll('button')].find(b=>/Accepted|Accept Plan/i.test(b.textContent||''))?.textContent?.trim(),
  }));
  console.log('AFTER ACCEPT:', JSON.stringify(todo, null, 2));

  // Now visit Home to verify the days got written
  await page.evaluate(() => { location.hash='#home'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/p04_V3_home_days.png`, fullPage: true });

  // Re-generate (accept already happened): click generate AGAIN, accept AGAIN -> dup check
  await gotoAI(page);
  await page.evaluate(() => { const f=document.querySelector('#aiDateFrom'); const t=document.querySelector('#aiDateTo'); if(f){f.value='2026-07-10';f.dispatchEvent(new Event('input',{bubbles:true}));} if(t){t.value='2026-07-10';t.dispatchEvent(new Event('input',{bubbles:true}));} });
  await (await page.$('.ai-generate-btn')).click();
  await page.waitForFunction(() => document.querySelectorAll('.ai-day-row').length > 0, { timeout: 6000 }).catch(()=>{});
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(b=>/Accept Plan/i.test(b.textContent||'')); b?.click(); });
  await page.waitForTimeout(1500);
  const afterRegen = await page.evaluate(() => ({ markedCards: document.querySelectorAll('.ai-marked-card').length }));
  console.log('AFTER REGEN+ACCEPT (dup check, should NOT double):', JSON.stringify(afterRegen));

  console.log('\nPAGE ERRORS:', pageErrors.join(' | ') || '(none)');
  await browser.close();
};
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
