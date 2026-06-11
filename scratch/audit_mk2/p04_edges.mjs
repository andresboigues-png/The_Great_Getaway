// p04 — UX edge cases: no-dates toast, end<start, very-long range heading, mobile
import { chromium } from 'playwright';
const PORT = 5104; const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scratch/audit_mk2/shots';

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
  await page.waitForTimeout(800);
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1380, height: 1000 } })).newPage();
  await login(page);
  await gotoAI(page);

  // EDGE 1: clear dates, click generate -> toast
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo');
    if (f) { f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); }
    if (t) { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await (await page.$('.ai-generate-btn'))?.click();
  await page.waitForTimeout(700);
  const e1 = await page.evaluate(() => ({
    toast: [...document.querySelectorAll('*')].map(n=>n.textContent).find(t=>/Pick your travel dates/i.test(t||''))?.slice(0,60),
    bodyHasToast: /Pick your travel dates/i.test(document.body.innerText),
  }));
  console.log('EDGE1 no-dates -> toast?', JSON.stringify(e1));
  await page.screenshot({ path: `${SHOTS}/p04_edge1_nodates.png` });

  // EDGE 2: end < start -> inline error + min attr behavior
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo');
    f.value = '2026-09-10'; f.dispatchEvent(new Event('input', { bubbles: true }));
    t.value = '2026-09-05'; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const e2 = await page.evaluate(() => ({
    inlineErr: /End date must be on or after/i.test(document.body.innerText),
    genDisabled: document.querySelector('.ai-generate-btn')?.disabled,
  }));
  // click generate anyway
  await (await page.$('.ai-generate-btn'))?.click();
  await page.waitForTimeout(700);
  const e2b = await page.evaluate(() => /End date must be on or after/i.test(document.body.innerText));
  console.log('EDGE2 end<start -> inlineErr/genDisabled:', JSON.stringify(e2), 'toastAfterClick:', e2b);
  await page.screenshot({ path: `${SHOTS}/p04_edge2_endbeforestart.png` });

  // EDGE 3: very long range (60 days) -> what heading/day count would show
  await page.evaluate(() => {
    const f = document.querySelector('#aiDateFrom'); const t = document.querySelector('#aiDateTo');
    f.value = '2026-09-01'; f.dispatchEvent(new Event('input', { bubbles: true }));
    t.value = '2026-10-30'; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const e3 = await page.evaluate(() => ({
    hint: [...document.querySelectorAll('p')].map(p=>p.textContent.trim()).find(t=>/Pick the start|day per/i.test(t)),
    // numDays the frontend WOULD compute (no upper clamp in runGenerate)
  }));
  console.log('EDGE3 60-day range hint:', JSON.stringify(e3));

  // MOBILE: how does the 2-col layout collapse?
  const mctx = await (await browser).newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await login(mp);
  await gotoAI(mp);
  await mp.screenshot({ path: `${SHOTS}/p04_mobile_ai.png`, fullPage: true });
  const m = await mp.evaluate(() => ({
    controls: !!document.querySelector('#aiControlsPanel'),
    mapH: document.querySelector('#aiGoogleMap')?.getBoundingClientRect().height,
    generate: !!document.querySelector('.ai-generate-btn'),
  }));
  console.log('MOBILE:', JSON.stringify(m));

  await browser.close();
};
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
