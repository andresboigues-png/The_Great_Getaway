import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE = 'http://127.0.0.1:5107';
const tkn = readFileSync('scratch/audit_mk2/.p07_share_token', 'utf8').trim().split('=')[1];
const b = await chromium.launch();
// FRESH anonymous context — no auth, no localStorage
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; const cerrs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });

console.log('Visiting /share/' + tkn + ' as ANON');
await p.goto(`${BASE}/share/${tkn}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.screenshot({ path: 'scratch/audit_mk2/shots/p07_anon_share_page.png', fullPage: true });

// What text does the stranger see? Look for any PII leakage.
const bodyText = await p.evaluate(() => document.body.innerText);
console.log('--- share page visible text (first 1200 chars) ---');
console.log(bodyText.slice(0, 1200));
console.log('--- leak scan ---');
for (const needle of ['Alex', 'Sara', 'Tom', 'splits', 'receipt', 'test-user', '@', 'TAP flights', '312', 'Settle']) {
  if (bodyText.includes(needle)) console.log('  CONTAINS:', JSON.stringify(needle));
}

// Also confirm there's no auth and the "I want this trip" / clone CTA behaves
const hasCloneCTA = await p.evaluate(() => /want this trip|clone|copy|make.*mine|i want/i.test(document.body.innerText));
console.log('has clone CTA:', hasCloneCTA);

await ctx.close(); await b.close();
console.log('pageerrors:', errs.length ? errs.slice(0, 4) : 'none');
console.log('console errors (filtered):', [...new Set(cerrs)].filter(e => !/frankfurter|CORS|ERR_FAILED|Access to fetch|historical/.test(e)).slice(0, 6));
