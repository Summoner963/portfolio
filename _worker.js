export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Dynamic sitemap ──
    if (path === '/sitemap.xml') {
      return await generateSitemap();
    }

    // ── Static assets ──
    if (path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json)$/i)) {
      try {
        return await env.ASSETS.fetch(request);
      } catch {
        return new Response('Not found', { status: 404 });
      }
    }

    // ── All SPA routes → 200 ──
    const indexUrl = new URL('/', url.origin);
    const response = await env.ASSETS.fetch(new Request(indexUrl, request));
    return new Response(response.body, {
      status: 200,
      headers: response.headers,
    });
  }
};

async function generateSitemap() {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1132024800&single=true&output=csv';
  const BASE = 'https://suman-dangal.com.np';

  const staticPages = [
    { loc: '/',           priority: '1.0', changefreq: 'monthly' },
    { loc: '/skills',     priority: '0.7', changefreq: 'monthly' },
    { loc: '/projects',   priority: '0.8', changefreq: 'monthly' },
    { loc: '/blog',       priority: '0.9', changefreq: 'weekly'  },
    { loc: '/experience', priority: '0.7', changefreq: 'monthly' },
    { loc: '/about',      priority: '0.6', changefreq: 'monthly' },
    { loc: '/contact',    priority: '0.5', changefreq: 'yearly'  },
  ];

  let blogUrls = [];
  try {
    const res  = await fetch(SHEET_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    blogUrls = rows
      .filter(r => r.Slug && r.Slug.trim())
      .map(r => ({
        loc:        `/blog/${r.Slug.trim()}`,
        priority:   '0.8',
        changefreq: 'monthly',
        lastmod:    r.Date ? formatDate(r.Date.trim()) : null,
      }));
  } catch (e) {
    console.warn('Sitemap: failed to fetch blog sheet', e.message);
  }

  const allPages = [...staticPages, ...blogUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${BASE}${p.loc}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // cache 1 hour
    },
  });
}

function parseCSV(raw) {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = splitRow(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}

function splitRow(line) {
  const cols = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur);
  return cols;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  } catch { return null; }
}