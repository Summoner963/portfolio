const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1132024800&single=true&output=csv';
const SITE_URL  = 'https://suman-dangal.com.np';

// Cache sheet data for 10 minutes so Worker doesn't fetch on every request
let sheetCache = null;
let sheetCacheTime = 0;
const CACHE_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── Static assets — serve directly ──
    if (path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json|xml)$/i)) {
      try { return await env.ASSETS.fetch(request); }
      catch { return new Response('Not found', { status: 404 }); }
    }

    // ── Dynamic sitemap ──
    if (path === '/sitemap.xml') {
      return await generateSitemap();
    }

    // ── Blog post route — prerender for bots ──
    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      const slug = blogMatch[1];
      const ua   = request.headers.get('user-agent') || '';
      const isBot = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|facebot|twitterbot|linkedinbot|whatsapp|telegram|crawler|spider|bot/i.test(ua);

      if (isBot) {
        // Serve prerendered HTML for bots/GSC
        return await prerenderBlogPost(slug, env, request);
      }
    }

    // ── All other SPA routes — serve index.html with 200 ──
    return await serveIndex(env, request);
  }
};

// ── Serve index.html ──
async function serveIndex(env, request) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  return new Response(response.body, {
    status: 200,
    headers: response.headers,
  });
}

// ── Fetch + cache Google Sheet ──
async function getSheetData() {
  const now = Date.now();
  if (sheetCache && (now - sheetCacheTime) < CACHE_MS) return sheetCache;
  try {
    const res  = await fetch(SHEET_URL);
    const text = await res.text();
    sheetCache     = parseCSV(text);
    sheetCacheTime = now;
    return sheetCache;
  } catch (e) {
    console.warn('Worker: sheet fetch failed', e.message);
    return sheetCache || [];
  }
}

// ── Prerender blog post for bots ──
async function prerenderBlogPost(slug, env, request) {
  const rows = await getSheetData();
  const post = rows.find(r => (r.Slug || '').trim() === slug);

  if (!post) {
    // Real 404 — post doesn't exist
    const html = `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <title>Post Not Found | Suman Dangal</title>
      <meta name="robots" content="noindex, nofollow">
    </head><body>
      <h1>Post not found</h1>
      <p>No post with slug "${slug}" exists.</p>
      <a href="${SITE_URL}/blog">← Back to Blog</a>
    </body></html>`;
    return new Response(html, {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  // Build full prerendered HTML for this post
  const title    = post.Title    || '';
  const excerpt  = post.Excerpt  || '';
  const date     = post.Date     || '';
  const category = post.Category || 'Post';
  const content  = post.Content  || '';
  const postUrl  = `${SITE_URL}/blog/${slug}`;
  const imageUrl = fixImgUrl(post.Image_URL || '');

  // Convert markdown-ish content to basic HTML for bots
  const bodyHTML = simpleMarkdown(content);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} | Suman Dangal</title>
  <meta name="description" content="${escHtml(excerpt)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${postUrl}">
  <meta property="og:title"       content="${escHtml(title)} | Suman Dangal">
  <meta property="og:description" content="${escHtml(excerpt)}">
  <meta property="og:url"         content="${postUrl}">
  <meta property="og:type"        content="article">
  ${imageUrl ? `<meta property="og:image" content="${escHtml(imageUrl)}">` : ''}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "${escJson(title)}",
    "description": "${escJson(excerpt)}",
    "datePublished": "${escJson(date)}",
    "url": "${postUrl}",
    "author": {
      "@type": "Person",
      "name": "Suman Dangal",
      "url": "${SITE_URL}"
    }
    ${imageUrl ? `,"image": "${escJson(imageUrl)}"` : ''}
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type":"ListItem","position":1,"name":"Home","item":"${SITE_URL}/"},
      {"@type":"ListItem","position":2,"name":"Blog","item":"${SITE_URL}/blog"},
      {"@type":"ListItem","position":3,"name":"${escJson(title)}","item":"${postUrl}"}
    ]
  }
  </script>
  <style>
    body{font-family:sans-serif;max-width:740px;margin:0 auto;padding:2rem;color:#1a1e1a;line-height:1.7}
    h1{font-size:2rem;margin-bottom:.5rem;color:#1b4332}
    h2{font-size:1.4rem;margin-top:2rem;color:#1a1e1a}
    h3{font-size:1.1rem;color:#2d6a4f}
    .meta{font-size:.8rem;color:#8a9688;margin-bottom:2rem}
    .cat{background:#edf5f0;color:#2d6a4f;padding:.2rem .6rem;border-radius:1rem;font-size:.75rem;margin-right:.5rem}
    p{color:#5a6659;margin-bottom:1rem}
    img{max-width:100%;border-radius:.5rem;margin:1rem 0}
    a{color:#2d6a4f}
    nav{margin-bottom:2rem;font-size:.85rem}
  </style>
</head>
<body>
  <nav><a href="${SITE_URL}/">Home</a> → <a href="${SITE_URL}/blog">Blog</a> → ${escHtml(title)}</nav>
  <h1>${escHtml(title)}</h1>
  <div class="meta">
    <span class="cat">${escHtml(category)}</span>
    <time datetime="${escHtml(date)}">${escHtml(date)}</time>
  </div>
  ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(title)}" width="720" height="400">` : ''}
  <div>${bodyHTML}</div>
  <hr>
  <p><a href="${SITE_URL}/blog">← Back to all posts</a></p>

  <!-- Load full SPA for human visitors who have JS -->
  <script>
    // If this is a real browser (not a bot), redirect to SPA
    if (typeof window !== 'undefined' && window.history) {
      // Already on the right URL, just load the SPA assets
      window.location.reload();
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    }
  });
}

// ── Dynamic sitemap ──
async function generateSitemap() {
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
    const rows = await getSheetData();
    blogUrls = rows
      .filter(r => r.Slug && r.Slug.trim())
      .map(r => ({
        loc:        `/blog/${r.Slug.trim()}`,
        priority:   '0.8',
        changefreq: 'monthly',
        lastmod:    formatDate(r.Date || ''),
      }));
  } catch {}
  const all = [...staticPages, ...blogUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(p => `  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml;charset=UTF-8', 'Cache-Control': 'public, max-age=3600' }
  });
}

// ── Helpers ──
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJson(s) {
  return String(s || '').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n');
}
function fixImgUrl(url) {
  if (!url) return '';
  url = url.trim();
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}`;
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}`;
  const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
  if (m3) return `https://lh3.googleusercontent.com/d/${m3[1]}`;
  return url;
}
function simpleMarkdown(text) {
  if (!text) return '';
  return text
    .split(/\n/)
    .map(line => {
      const l = line.trim();
      if (!l) return '';
      if (l.startsWith('## '))  return `<h2>${escHtml(l.slice(3))}</h2>`;
      if (l.startsWith('### ')) return `<h3>${escHtml(l.slice(4))}</h3>`;
      if (l.startsWith('- '))   return `<li>${escHtml(l.slice(2))}</li>`;
      return `<p>${escHtml(l)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
      }</p>`;
    })
    .join('\n');
}
function parseCSV(raw) {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitRow(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
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
  return cols.map(s => s.replace(/^"|"$/g,'').replace(/""/g,'"'));
}
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}