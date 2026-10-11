// SPA end-to-end check over the Chrome DevTools Protocol (Node 22+ global
// WebSocket, no dependencies). Needs the site running with fixture data:
//   terminal 1: npm run mock-sheets     terminal 2: npm run dev:mock
//   terminal 3: npm run test:e2e        (or node tests/e2e-spa.mjs <base URL>)
// Checks: inactive views arrive as <template>s and are built on navigation,
// one h1 per page, post links, <head> updates, back button, 404, no console errors.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }
const PORT = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(browser, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
    problems.push(`console.${m.params.type}: ` + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/googletagmanager|google-analytics|cloudflareinsights/.test(m.params.entry.url || ''))
    problems.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

const out = [];
const check = (name, ok, detail = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + JSON.stringify(detail)}`);
const state = () => ev(`(() => {
  const v = document.querySelector('#app .view.active');
  return { path: location.pathname + location.search, view: v?.id, title: document.title,
    h1s: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().slice(0, 60)),
    tpls: document.querySelectorAll('template[data-view-tpl]').length,
    activeHasTpl: !!v?.querySelector(':scope > template[data-view-tpl]'),
    canonical: document.getElementById('canonical')?.href };
})()`);
const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(1500); };

await send('Page.navigate', { url: `${BASE}/blog/get-free-domain-in-nepal` });
await sleep(2500);
let s = await state();
check('post: server view kept, 9 inert templates (10 views), one h1', s.view === 'view-article' && s.tpls === 9 && s.h1s.length === 1, s);
check('post: related posts + older/newer nav rendered', await ev(`!!document.querySelector('.post-nav') && !!document.querySelector('.related-posts .blog-card')`));

await click('.post-nav-newer');
s = await state();
check('newer-post link navigates in the SPA (one h1, title + canonical updated)',
  s.path === '/blog/qa-edge-cases' && s.h1s.length === 1 && s.canonical.endsWith('/blog/qa-edge-cases') && s.title.includes('Edge'), s);
check('client-rendered article also has post nav', await ev(`!!document.querySelector('#articleWrap .post-nav')`));
check('markdown alternate link follows the SPA post', (await ev(`document.querySelector('link[type="text/markdown"]')?.href`)) === 'https://suman-dangal.com.np/blog/qa-edge-cases.md');

await click('.nav-links a[href="/skills"]');
s = await state();
check('markdown alternate link removed off posts', (await ev(`document.querySelectorAll('link[type="text/markdown"]').length`)) === 0);
check('skills: template materialised, content rendered, one h1', s.view === 'view-skills' && !s.activeHasTpl && s.tpls === 8 && s.h1s.length === 1 &&
  await ev(`document.querySelectorAll('#skillsGrid > *').length > 0`), s);

await click('.nav-links a[href="/"], a.nav-logo, a[href="/"][data-link]');
s = await state();
check('home: hero h1 and Site text from the server inside the template', s.view === 'view-home' && s.h1s.length === 1 &&
  await ev(`document.getElementById('site-h1')?.tagName === 'H1' && document.querySelector('[data-site="hero_subtitle"]')?.textContent.length > 20`), s);

await ev('history.back()'); await sleep(1500);
s = await state();
check('back button returns to skills', s.path === '/skills' && s.view === 'view-skills' && s.h1s.length === 1, s);

await click('.nav-links a[href="/blog"]');
s = await state();
check('blog list renders cards', s.view === 'view-blog' && await ev(`document.querySelectorAll('#blogGrid .blog-card').length > 0`) && s.h1s.length === 1, s);

await click('.nav-links a[href="/contact"]');
s = await state();
check('contact view renders (FAQ + tiles)', s.view === 'view-contact' && s.h1s.length === 1 &&
  await ev(`!!document.querySelector('#view-contact .contact-grid, #view-contact a[href^="mailto"], #view-contact [data-site]')`), s);

await ev(`(() => { const a = document.createElement('a'); a.href = '/no-such-page'; a.setAttribute('data-link', ''); document.body.append(a); a.click(); })()`);
await sleep(1500);
s = await state();
check('unknown page shows 404 overlay with one h1', s.h1s.length === 1 && await ev(`!!document.getElementById('spa-404-overlay')`), s);

// Fresh load of other routes
for (const p of ['/', '/projects', '/experience', '/about', '/privacy', '/blog?page=2']) {
  await send('Page.navigate', { url: BASE + p }); await sleep(2000);
  s = await state();
  check(`fresh load ${p}: one h1, active view not a template`, s.h1s.length === 1 && !s.activeHasTpl, s);
}

check('no console errors or exceptions', problems.length === 0, problems);
console.log(out.join('\n'));
console.log(`\n${out.filter(l => l.startsWith('PASS')).length} passed, ${out.filter(l => l.startsWith('FAIL')).length} failed`);
ws.close(); chrome.kill();
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
