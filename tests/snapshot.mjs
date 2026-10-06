// Captures SEO/security-critical parts of key URLs into JSON snapshots.
// Usage: node tests/snapshot.mjs <baseUrl> <outDir>
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base = 'http://127.0.0.1:8788', out = 'tests/baseline'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

// [name, path, extra request headers]
export const CASES = [
  ['home', '/'], ['skills', '/skills'], ['projects', '/projects'], ['blog', '/blog'],
  ['blog-page-2', '/blog?page=2'], ['experience', '/experience'], ['about', '/about'],
  ['contact', '/contact'],
  ['post', '/blog/cloudflare-hosting-nepal'], ['post-escaping', '/blog/qa-edge-cases'],
  ['post-draft', '/blog/draft-post'], ['post-unknown', '/blog/does-not-exist'],
  ['unknown', '/no-such-page'], ['missing-asset', '/no-such-file.js'],
  ['trailing-slash', '/skills/'], ['legacy-redirect', '/blog/free-domain-in-nepal'],
  ['sitemap', '/sitemap.xml'], ['robots', '/robots.txt'], ['llms', '/llms.txt'],
  ['manifest', '/site.webmanifest'], ['admin', '/back-lab'],
  ['api-blog', '/api/data?sheet=blog'], ['api-unknown-sheet', '/api/data?sheet=secret'],
  ['pagesdev-prod', '/blog', { Host: 'portfolio-1e6.pages.dev' }],
  ['pagesdev-preview', '/blog', { Host: 'abc123.portfolio-1e6.pages.dev' }],
  ['www', '/blog', { Host: 'www.suman-dangal.com.np' }],
];

const HEADERS = ['content-type', 'cache-control', 'location', 'x-robots-tag',
  'content-security-policy', 'strict-transport-security', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy',
  'cross-origin-opener-policy', 'access-control-allow-origin', 'retry-after'];

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, base);
    http.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (snapshot)', ...headers } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) || [])[1];
const decode = s => s == null ? s : s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function extract(html) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const metas = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = attr(tag, 'name') || attr(tag, 'property');
    if (!key || key === 'viewport') continue;
    const v = decode(attr(tag, 'content'));
    metas[key] = key in metas ? [].concat(metas[key], v) : v;
  }
  const jsonLd = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonLd.push(JSON.parse(m[1])); } catch { jsonLd.push({ INVALID_JSON: m[1].trim().slice(0, 200) }); }
  }
  // Visible markup only: drop scripts/styles so JS template strings don't count
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = s => decode(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return {
    lang: (html.match(/<html[^>]*\slang="([^"]*)"/i) || [])[1] || null,
    title: decode((head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] ?? null),
    canonical: decode(attr((head.match(/<link[^>]*rel="canonical"[^>]*>/i) || [''])[0], 'href') ?? null),
    themeColor: metas['theme-color'] ?? null,
    manifest: /<link[^>]*rel="manifest"/i.test(head),
    meta: metas,
    jsonLdTypes: jsonLd.map(o => o['@type'] || 'INVALID'),
    jsonLd,
    h1: [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => text(m[1])),
    activeView: (visible.match(/id="view-([a-z-]+)"\s+class="[^"]*\bactive\b/i) || [])[1] || null,
    hasGtag: /googletagmanager\.com\/gtag\/js/.test(html),
    usesDocumentWrite: /document\.write\(/.test(html),
    bodyExcerpt: text((visible.match(/<main[\s\S]*?<\/main>|<article[\s\S]*?<\/article>/i) || [''])[0]).slice(0, 300),
    scriptInjection: /<script>alert\(1\)/i.test(visible) || /href="javascript:/i.test(visible),
  };
}

const index = {};
for (const [name, path, hdrs] of CASES) {
  const r = await get(path, hdrs);
  const headers = Object.fromEntries(HEADERS.filter(h => r.headers[h]).map(h => [h, r.headers[h]]));
  const isHtml = /html/.test(r.headers['content-type'] || '');
  const snap = { path, requestHeaders: hdrs || {}, status: r.status, headers,
    ...(isHtml ? extract(r.body) : { body: r.body.slice(0, 4000) }) };
  writeFileSync(`${out}/${name}.json`, JSON.stringify(snap, null, 2) + '\n');
  index[name] = { status: r.status, title: snap.title ?? null, canonical: snap.canonical ?? null,
    h1: snap.h1 ?? null, location: headers.location ?? null };
}
writeFileSync(`${out}/_index.json`, JSON.stringify(index, null, 2) + '\n');
console.log(`${CASES.length} snapshots → ${out}`);
