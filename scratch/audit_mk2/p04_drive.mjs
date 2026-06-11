// p04 — AI planner audit drive (Tom persona)
import { chromium } from 'playwright';

const PORT = 5104;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';

const consoleErrors = [];
const pageErrors = [];

async function login(page, token = 'test:test-user-1', name = 'Alex Rivera') {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name }),
    });
    localStorage.setItem('gg_auth_token', 'x');
  }, { token, name });
  await page.evaluate(() => { location.hash = '#home'; });
  await page.reload({ waitUntil: 'networkidle' });
}

async function gotoAI(page) {
  // SPA router listens to hashchange; force the event + give React time.
  await page.evaluate(() => {
    if (location.hash === '#ai') location.hash = '#home';
    location.hash = '#ai';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  // wait until the AI page's "Plan with AI" header (h1) or controls panel appears
  await page.waitForFunction(() => {
    return !!document.querySelector('#aiControlsPanel')
      || !!document.querySelector('#emptyMap')
      || /Plan with AI|Ready for a new adventure/i.test(document.querySelector('h1')?.textContent || '');
  }, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // ---- 1. Active-trip AI view (Alex has Lisbon active) ----
  await login(page);
  await gotoAI(page);
  await page.screenshot({ path: `${SHOTS}/p04_01_ai_active.png`, fullPage: true });

  // Report what trip is active + dates prefilled
  const state1 = await page.evaluate(() => {
    const from = document.querySelector('#aiDateFrom')?.value;
    const to = document.querySelector('#aiDateTo')?.value;
    const genBtn = document.querySelector('.ai-generate-btn')?.textContent?.trim();
    const usageTitle = document.querySelector('.card-title')?.textContent?.trim();
    const bar = document.querySelector('[role="progressbar"]');
    return {
      from, to, genBtn,
      hasUsageBar: !!bar,
      barPct: bar?.getAttribute('aria-valuenow'),
      title: document.querySelector('h1')?.textContent?.trim(),
      subtitle: document.querySelector('.ai-subtitle')?.textContent?.trim(),
    };
  });
  console.log('STATE1 (active AI):', JSON.stringify(state1, null, 2));

  // ---- 2. Generate itinerary (real keys present) ----
  // ensure dates present
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom');
    const t = document.querySelector('#aiDateTo');
    if (f && !f.value) { f.value = '2026-06-01'; f.dispatchEvent(new Event('input', { bubbles: true })); }
    if (t && !t.value) { t.value = '2026-06-03'; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  // type food + sights prefs
  const food = await page.$('#aiFoodContext');
  if (food) { await food.fill('Love seafood and pastel de nata, no spicy food'); }
  const sights = await page.$('#aiSightseeingContext');
  if (sights) { await sights.fill('Museums and viewpoints, avoid long uphill walks'); }
  await page.screenshot({ path: `${SHOTS}/p04_02_filled.png`, fullPage: true });

  // click generate
  const gen = await page.$('.ai-generate-btn');
  if (gen) {
    await gen.click();
    // capture loading state quickly
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/p04_03_loading.png` });
    // wait for result or error (up to 40s — real Gemini + places)
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return /Itinerary|went wrong|overloaded|quota|Accept Plan/i.test(t) && !/Generating…/.test(document.querySelector('.ai-generate-btn')?.textContent || '');
    }, { timeout: 45000 }).catch(() => console.log('!! generate did not resolve in 45s'));
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${SHOTS}/p04_04_result.png`, fullPage: true });

  const state2 = await page.evaluate(() => {
    const dayCards = document.querySelectorAll('.ai-day-row').length;
    const acceptBtn = [...document.querySelectorAll('button')].find((b) => /Accept Plan/i.test(b.textContent || ''));
    const mealBlocks = document.querySelectorAll('.ai-plan-block').length;
    const unverified = document.querySelectorAll('.ai-plan-block__unverified-chip, .ai-plan-block__item--unverified').length;
    const placeCards = document.querySelectorAll('.ai-place-card').length;
    return { dayCards, mealBlocks, unverified, placeCards, hasAccept: !!acceptBtn, acceptText: acceptBtn?.textContent?.trim() };
  });
  console.log('STATE2 (after generate):', JSON.stringify(state2, null, 2));

  // ---- 3. Accept plan ----
  const accept = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /Accept Plan/i.test(b.textContent || '')));
  if (accept) {
    const el = accept.asElement();
    if (el) {
      await el.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/p04_05_accepted.png`, fullPage: true });
    }
  }
  const state3 = await page.evaluate(() => {
    const acceptBtn = [...document.querySelectorAll('button')].find((b) => /Accepted|Accept Plan/i.test(b.textContent || ''));
    // count tripDays now in STATE via the home page would need nav; just read button text
    return { acceptText: acceptBtn?.textContent?.trim() };
  });
  console.log('STATE3 (after accept):', JSON.stringify(state3, null, 2));

  // check Home day cards reflect plan
  await page.evaluate(() => { location.hash = '#home'; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/p04_06_home_after_accept.png`, fullPage: true });

  // ---- 4. Re-generate behavior (back to AI, generate again) ----
  await gotoAI(page);
  await page.waitForTimeout(1200);
  const state4pre = await page.evaluate(() => {
    // itinerary should persist (aiPlan)
    return { dayCards: document.querySelectorAll('.ai-day-row').length };
  });
  console.log('STATE4pre (AI remount, plan persisted?):', JSON.stringify(state4pre));
  await page.screenshot({ path: `${SHOTS}/p04_07_ai_remount.png`, fullPage: true });

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleErrors.slice(0, 40).join('\n') || '(none)');
  console.log('\n=== PAGE ERRORS ===');
  console.log(pageErrors.slice(0, 40).join('\n') || '(none)');

  await browser.close();
};

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
