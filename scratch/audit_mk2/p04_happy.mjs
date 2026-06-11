// p04 — 1-day happy path (under 20s cap): render, accept, to-do panel, regenerate
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
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 1400 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await login(page);
  await gotoAI(page);

  // 1-DAY trip so it completes within the 20s frontend cap
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo');
    if (f) { f.value = '2026-07-10'; f.dispatchEvent(new Event('input', { bubbles: true })); }
    if (t) { t.value = '2026-07-10'; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  const food = await page.$('#aiFoodContext'); if (food) await food.fill('seafood, pastel de nata');
  const sights = await page.$('#aiSightseeingContext'); if (sights) await sights.fill('viewpoints, tile museum');

  const gen = await page.$('.ai-generate-btn');
  await gen.click();
  await page.waitForFunction(() => {
    const stillGen = /Generating/.test(document.querySelector('.ai-generate-btn')?.textContent || '');
    return !stillGen && (/Itinerary|Accept Plan|went wrong|hiccup|quota/i.test(document.body.innerText));
  }, { timeout: 25000 }).catch(() => console.log('!! 1-day gen timed out at 25s'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/p04_H1_1day_result.png`, fullPage: true });

  const result = await page.evaluate(() => ({
    dayRows: document.querySelectorAll('.ai-day-row').length,
    placeCards: document.querySelectorAll('.ai-place-card').length,
    unverified: document.querySelectorAll('.ai-plan-block__item--unverified').length,
    heading: [...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).find(t=>/Itinerary/.test(t)),
    hasAccept: !!([...document.querySelectorAll('button')].find(b=>/Accept Plan/i.test(b.textContent||''))),
    crash: /Something broke on this page/i.test(document.body.innerText),
    hiccup: /hiccup|went wrong/i.test(document.body.innerText),
  }));
  console.log('1-DAY RESULT:', JSON.stringify(result, null, 2));

  if (result.hasAccept) {
    // zoom into a day card + a place card for detail
    const card = await page.$('.ai-place-card');
    if (card) { await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/p04_H2_daycard_detail.png` }); }
    // Accept
    await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(b=>/Accept Plan/i.test(b.textContent||'')); b?.click(); });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/p04_H3_after_accept.png`, fullPage: true });
    const todoPanel = await page.evaluate(() => {
      const cards = document.querySelectorAll('.ai-marked-card').length;
      const panelTitle = [...document.querySelectorAll('h3')].map(h=>h.textContent.trim()).find(t=>/Ticked|to-do/i.test(t));
      const acceptText = [...document.querySelectorAll('button')].find(b=>/Accepted|Accept Plan/i.test(b.textContent||''))?.textContent?.trim();
      return { markedCards: cards, panelTitle, acceptText };
    });
    console.log('TO-DO PANEL after accept:', JSON.stringify(todoPanel));
  }

  console.log('\nPAGE ERRORS:', pageErrors.join(' | ') || '(none)');
  await browser.close();
};
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
