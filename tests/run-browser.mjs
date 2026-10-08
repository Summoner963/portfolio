// Run the browser test pages (tests/*.test.html) in headless Chrome or Edge.
// No dependencies: Node's http module serves the repo, the browser's
// --dump-dom prints the page after the tests ran.  Usage: npm run test:browser
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['tests/editor.test.html', 'tests/cms-form.test.html'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;

let failedTotal = 0;
for (const page of PAGES) {
  const profile = mkdtempSync(join(tmpdir(), 'cms-test-'));
  const html = await new Promise(resolve => execFile(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
    '--virtual-time-budget=20000', '--dump-dom', `http://127.0.0.1:${port}/${page}`,
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 120000 }, (err, stdout) => resolve(stdout || '')));
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  const m = html.match(/<pre id="results">([\s\S]*?)<\/pre>/);
  const text = (m ? m[1] : 'NO RESULTS (page failed to run)')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const failed = (text.match(/^FAIL/gm) || []).length + (m ? 0 : 1);
  failedTotal += failed;
  console.log(`\n── ${page}`);
  console.log(failed ? text : text.split('\n').filter(l => !l.startsWith('PASS')).join('\n').trim());
}
server.close();
process.exit(failedTotal ? 1 : 0);
