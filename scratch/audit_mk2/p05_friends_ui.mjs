import { chromium } from 'playwright';
const PORT = 5105, BASE = `http://127.0.0.1:${PORT}`, SHOTS = 'scratch/audit_mk2/shots';
async function login(page, token, name) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ token, name }) => {
    await fetch('/api/auth/google', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, name }) });
    localStorage.setItem('gg_auth_token','x');
  }, { token, name });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}
async function gotoPage(page, hash) {
  await page.evaluate((h) => { window.location.hash = h; window.dispatchEvent(new HashChangeEvent('hashchange')); }, hash);
  await page.waitForTimeout(2000);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: '+m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: '+e.message));

await login(page, 'test:test-user-1', 'Alex Rivera');
await gotoPage(page, '#friends');
const h1 = await page.evaluate(()=>document.querySelector('h1')?.textContent||'');
console.log('FRIENDS H1:', h1);
await page.screenshot({ path:`${SHOTS}/p05_friends_default.png`, fullPage:true });

// Click through the three network tabs
for (const tab of ['followers','following','friends']) {
  const ok = await page.evaluate((t)=>{ const els=[...document.querySelectorAll('.network-tabnav__tab, [role="tab"]')]; const b=els.find(e=>(e.textContent||'').toLowerCase().includes(t)); if(b){b.click();return true;} return false; }, tab);
  await page.waitForTimeout(1200);
  if (ok) { await page.screenshot({ path:`${SHOTS}/p05_friends_${tab}.png`, fullPage:true }); console.log('tab',tab,'ok'); }
  else console.log('tab',tab,'NOT FOUND');
}

// Open notifications bell
await gotoPage(page, '#home');
const bellOpened = await page.evaluate(()=>{
  const bell=[...document.querySelectorAll('button, [role="button"], a')].find(e=>/notif|bell/i.test(e.className||'')|| (e.querySelector && e.getAttribute('aria-label')||'').toLowerCase().includes('notif'));
  if(bell){bell.click();return true;}
  // fallback: any element with a notification badge near top
  const badge=document.querySelector('[class*="notif"]');
  if(badge){badge.click();return true;}
  return false;
});
await page.waitForTimeout(1500);
await page.screenshot({ path:`${SHOTS}/p05_notifications.png`, fullPage:false });
console.log('bell opened:', bellOpened);

// dump notifications API
const notifs = await page.evaluate(async ()=>{ const r=await fetch('/api/notifications/list'); return r.ok?await r.json():('err '+r.status); });
console.log('NOTIFS:', JSON.stringify(notifs).slice(0,1200));

console.log('\nERRORS:', errs.filter(e=>!/Maps|Referer|maps\/doc|site URL/.test(e)).join('\n')||'none');
await browser.close();
