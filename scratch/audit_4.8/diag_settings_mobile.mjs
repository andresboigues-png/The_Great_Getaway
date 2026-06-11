// Diagnose: mobile Settings — can't tap, only scroll. Find what's at the
// tap point + whether the management-card click navigates.
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5073';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => { await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'test:test-user-1', name: 'Alex Rivera' }) }); localStorage.setItem('gg_auth_token', 'x'); });
await page.evaluate(() => { window.location.hash = '#settings'; });
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2200);

// What element sits at the center of the first management card?
const probe = await page.evaluate(() => {
  const card = document.querySelector('.management-card');
  if (!card) return { found: false };
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  // Walk up from the topmost element to see if it (or an ancestor up to the card) is the card/button.
  const chain = [];
  let el = top;
  for (let i = 0; i < 6 && el; i++) { chain.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || ''}`.slice(0, 60)); el = el.parentElement; }
  const cs = top ? getComputedStyle(top) : null;
  return {
    found: true,
    cardRect: { top: Math.round(r.top), h: Math.round(r.height) },
    topElByPoint: chain[0],
    chain,
    topPointerEvents: cs && cs.pointerEvents,
    cardContainsTop: card.contains(top),
  };
});
console.log('PROBE', JSON.stringify(probe, null, 2));

// Try a real tap on the first card and see if the view changes (menu -> general).
const before = await page.evaluate(() => document.body.innerText.slice(0, 60));
await page.locator('.management-card').first().tap().catch(e => console.log('TAP ERR', e.message));
await page.waitForTimeout(800);
const afterHasSubtab = await page.locator('.general-subtab').count().catch(() => -1);
console.log('AFTER TAP — general-subtab count:', afterHasSubtab, '(>0 means navigation worked)');
console.log('CONSOLE ERRORS:', errs.length ? errs.slice(0, 8) : 'none');
await ctx.close();
await browser.close();
