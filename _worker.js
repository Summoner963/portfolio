const BLOG_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1132024800&single=true&output=csv';
const FAQ_SHEET_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=303688554&single=true&output=csv';
const SITE_URL       = 'https://suman-dangal.com.np';

// Separate caches for blog and FAQ sheets
let blogCache = null, blogCacheTime = 0;
let faqCache  = null, faqCacheTime  = 0;
const CACHE_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── Static assets — serve directly (sitemap.xml excluded) ──
    if (path !== '/sitemap.xml' && path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json|xml)$/i)) {
      try { return await env.ASSETS.fetch(request); }
      catch { return new Response('Not found', { status: 404 }); }
    }

    // ── Dynamic sitemap ──
    if (path === '/sitemap.xml') {
      return await generateSitemap();
    }

    // ── Blog post route — prerender for ALL visitors ──
    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      return await prerenderBlogPost(blogMatch[1], env, request);
    }

    // ── All other SPA routes — serve index.html ──
    return await serveIndex(env, request);
  }
};

// ── Serve index.html ──
async function serveIndex(env, request) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  return new Response(response.body, { status: 200, headers: response.headers });
}

// ── Fetch + cache blog sheet ──
async function getBlogData() {
  const now = Date.now();
  if (blogCache && (now - blogCacheTime) < CACHE_MS) return blogCache;
  try {
    const text = await fetch(BLOG_SHEET_URL).then(r => r.text());
    blogCache = parseCSV(text);
    blogCacheTime = now;
    return blogCache;
  } catch (e) {
    console.warn('Worker: blog sheet fetch failed', e.message);
    return blogCache || [];
  }
}

// ── Fetch + cache FAQ sheet ──
async function getFaqData() {
  const now = Date.now();
  if (faqCache && (now - faqCacheTime) < CACHE_MS) return faqCache;
  try {
    const text = await fetch(FAQ_SHEET_URL).then(r => r.text());
    faqCache = parseCSV(text);
    faqCacheTime = now;
    return faqCache;
  } catch (e) {
    console.warn('Worker: faq sheet fetch failed', e.message);
    return faqCache || [];
  }
}

// ── Prerender blog post ──
async function prerenderBlogPost(slug, env, request) {
  // Fetch blog + FAQ in parallel
  const [blogRows, faqRows] = await Promise.all([getBlogData(), getFaqData()]);

  const post = blogRows.find(r => (r.Slug || '').trim() === slug);

  if (!post) {
    const html = `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <title>Post Not Found | Suman Dangal</title>
      <meta name="robots" content="noindex, nofollow">
    </head><body>
      <h1>Post not found</h1>
      <p>No post with slug "${slug}" exists.</p>
      <a href="${SITE_URL}/blog">← Back to Blog</a>
    </body></html>`;
    return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const title    = post.Title    || '';
  const excerpt  = post.Excerpt  || '';
  const date     = post.Date     || '';
  const category = post.Category || 'Post';
  const postUrl  = `${SITE_URL}/blog/${slug}`;
  const imageUrl = fixImgUrl(post.Image_URL || '');

  // Build imgMap from Img1_URL, Img2_URL ... columns
  const imgMap = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^[Ii]mg(\d+)_[Uu][Rr][Ll]$/);
    if (m) imgMap[`img${m[1]}`] = post[key];
  }

  const bodyHTML = renderMarkdown(post.Content || '', imgMap);

  // FAQ rows for this slug, sorted by FAQ_Number
  const faqItems = faqRows
    .filter(r => (r.Blog_Slug || '').trim() === slug)
    .sort((a, b) => Number(a.FAQ_Number) - Number(b.FAQ_Number));

  // Build FAQ HTML section
  const faqSectionHTML = faqItems.length ? `
  <section style="margin-top:2.5rem">
    <h2 style="font-size:1.4rem;color:#1b4332;margin-bottom:1rem">Frequently Asked Questions</h2>
    ${faqItems.map(f => `
    <details style="border:1px solid #e2e6df;border-radius:.5rem;margin-bottom:.75rem;overflow:hidden">
      <summary style="padding:.9rem 1rem;font-weight:600;cursor:pointer;background:#f7f8f6;color:#1a1e1a;list-style:none">
        ${escHtml(f.FAQ_Question || '')}
      </summary>
      <div style="padding:.9rem 1rem;color:#5a6659;line-height:1.7">
        ${escHtml(f.FAQ_Answer || '')}
      </div>
    </details>`).join('')}
  </section>` : '';

  // FAQ JSON-LD schema — only inject if there are FAQ items
  const faqSchemaTag = faqItems.length ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      ${faqItems.map(f => `{
        "@type": "Question",
        "name": "${escJson(f.FAQ_Question || '')}",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "${escJson(f.FAQ_Answer || '')}"
        }
      }`).join(',\n      ')}
    ]
  }
  </script>` : '';

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
    "author": { "@type": "Person", "name": "Suman Dangal", "url": "${SITE_URL}" }
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

  ${faqSchemaTag}

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
  ${faqSectionHTML}
  <hr>
  <p><a href="${SITE_URL}/blog">← Back to all posts</a></p>

  <script>
    // Load full SPA only for real human browsers — bots stay on static shell
    (function() {
      var ua = navigator.userAgent || '';
      var isBot = /google|bing|yandex|baidu|duckduck|slurp|facebook|twitter|linkedin|whatsapp|telegram|apple|pinterest|reddit|slack|discord|crawler|spider|bot|headless|prerender|python|curl|wget|java|ruby|go-http|node-fetch/i.test(ua);
      var looksReal = typeof window !== 'undefined' && typeof history !== 'undefined' && navigator.cookieEnabled;
      if (!isBot && looksReal) {
        fetch('/').then(function(r){ return r.text(); }).then(function(html){
          document.open(); document.write(html); document.close();
        }).catch(function(){});
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=3600' }
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
    const rows = await getBlogData();
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

// ── Markdown renderer ──
// Rules:
//   Lines starting with | are content lines — strip the | first
//   Lines NOT starting with | (e.g. bare ## headings) are also processed
//   Blank line or "|" alone = spacer <br>
function renderMarkdown(text, imgMap) {
  if (!text) return '';

  function inlineFmt(raw) {
    return escHtml(raw)
      .replace(/&#124;/g, '|')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="font-family:monospace;background:#f0f4f0;padding:.1em .35em;border-radius:.25em;font-size:.9em">$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  }

  const lines = text.split(/\n/);
  const out   = [];
  let inList  = false;
  let inOl    = false;

  function closeList() {
    if (inList) { out.push('</ul>'); inList = false; }
    if (inOl)   { out.push('</ol>'); inOl   = false; }
  }

  for (const raw of lines) {
    // Strip leading | if present — it's just the content delimiter
    const l = raw.startsWith('|') ? raw.slice(1) : raw;

    // Blank / spacer
    if (l.trim() === '') {
      closeList();
      out.push('<br>');
      continue;
    }

    // Headings
    if (l.startsWith('## ')) {
      closeList();
      out.push(`<h2 style="font-size:1.4rem;margin:2rem 0 .6rem;color:#1a1e1a">${inlineFmt(l.slice(3))}</h2>`);
      continue;
    }
    if (l.startsWith('### ')) {
      closeList();
      out.push(`<h3 style="font-size:1.1rem;margin:1.5rem 0 .4rem;color:#2d6a4f">${inlineFmt(l.slice(4))}</h3>`);
      continue;
    }

    // Bullet  "- text"
    if (l.startsWith('- ')) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inList) { out.push('<ul style="margin:.6rem 0 .6rem 1.4rem;padding:0">'); inList = true; }
      out.push(`<li style="margin-bottom:.35rem">${inlineFmt(l.slice(2))}</li>`);
      continue;
    }

    // Numbered step  "1. text"
    if (/^\d+\.\s/.test(l)) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inOl) { out.push('<ol style="margin:.6rem 0 .6rem 1.4rem;padding:0">'); inOl = true; }
      out.push(`<li style="margin-bottom:.35rem">${inlineFmt(l.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }

    // Tip / callout  "> text"
    if (l.startsWith('> ')) {
      closeList();
      out.push(`<blockquote style="border-left:3px solid #52b788;margin:1.2rem 0;padding:.7rem 1rem;background:#edf5f0;border-radius:0 .4rem .4rem 0;color:#2d6a4f;font-style:italic">${inlineFmt(l.slice(2))}</blockquote>`);
      continue;
    }

    // Image  "[img1]" "[img2]" etc
    const imgMatch = l.trim().match(/^\[img(\d+)\]$/i);
    if (imgMatch && imgMap) {
      closeList();
      const src = fixImgUrl(imgMap[`img${imgMatch[1]}`] || '');
      if (src) {
        out.push(`<img src="${escHtml(src)}" alt="article image ${imgMatch[1]}" style="max-width:100%;border-radius:.5rem;margin:1rem 0;display:block" loading="lazy">`);
      }
      continue;
    }

    // Normal paragraph
    closeList();
    out.push(`<p style="color:#5a6659;margin-bottom:1rem;line-height:1.75">${inlineFmt(l)}</p>`);
  }

  closeList();
  return out.join('\n');
}

// ── Helpers ──
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJson(s) {
  return String(s || '').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'');
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