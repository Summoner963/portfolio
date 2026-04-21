const BLOG_SHEET_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1132024800&single=true&output=csv';
const FAQ_SHEET_URL    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=303688554&single=true&output=csv';
const IMAGES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1267436347&single=true&output=csv';
const SITE_URL         = 'https://suman-dangal.com.np';

// Separate caches for blog, FAQ and BlogImages sheets
let blogCache = null, blogCacheTime = 0;
let faqCache  = null, faqCacheTime  = 0;
let imgCache  = null, imgCacheTime  = 0;
const CACHE_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── CSV proxy — fixes CORS when Googlebot/browser fetches sheets ──
    if (path === '/api/sheet') {
      const target = url.searchParams.get('url');
      if (!target || !target.startsWith('https://docs.google.com/spreadsheets/')) {
        return new Response('Bad request', { status: 400 });
      }
      try {
        const resp = await fetch(target, { redirect: 'follow' });
        const text = await resp.text();
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=600'
          }
        });
      } catch (e) {
        return new Response('Fetch failed: ' + e.message, { status: 502 });
      }
    }

    // ── Dynamic sitemap ──
    if (path === '/sitemap.xml') {
      return await generateSitemap();
    }

    // ── llms.txt — serve explicitly so static asset handler doesn't block it ──
    // FIX: was returning 403 because the worker wasn't explicitly handling it.
    if (path === '/llms.txt') {
      const llmsContent = `# Suman Dangal — Dev & QA Engineer
# https://suman-dangal.com.np/

> Final-year BCA student building and testing full-stack web and mobile applications.
> Open to Dev and QA internship opportunities in Nepal.

## About

Suman Dangal is a final-year BCA student at Tribhuvan University, Bhaktapur, Nepal.
He specializes in full-stack development (Django, PHP, Java Android) and QA/manual testing.

## Pages

- [Home](https://suman-dangal.com.np/)
- [Skills](https://suman-dangal.com.np/skills/)
- [Projects](https://suman-dangal.com.np/projects/)
- [Blog](https://suman-dangal.com.np/blog/)
- [Experience](https://suman-dangal.com.np/experience/)
- [About](https://suman-dangal.com.np/about/)
- [Contact](https://suman-dangal.com.np/contact/)

## Contact

- Email: sumandangal888@gmail.com
- LinkedIn: https://linkedin.com/in/sumandangal963
`;
      return new Response(llmsContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // ── Static assets — serve directly ──
    if (path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json|xml)$/i)) {
      try { return await env.ASSETS.fetch(request); }
      catch { return new Response('Not found', { status: 404 }); }
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

// ── Fetch + cache BlogImages sheet ──
async function getImageData() {
  if (!IMAGES_SHEET_URL || IMAGES_SHEET_URL.includes('PASTE_YOUR')) return [];
  const now = Date.now();
  if (imgCache && (now - imgCacheTime) < CACHE_MS) return imgCache;
  try {
    const text = await fetch(IMAGES_SHEET_URL).then(r => r.text());
    imgCache = parseCSV(text);
    imgCacheTime = now;
    return imgCache;
  } catch (e) {
    console.warn('Worker: images sheet fetch failed', e.message);
    return imgCache || [];
  }
}

// ── Prerender blog post ──
async function prerenderBlogPost(slug, env, request) {
  const [blogRows, faqRows, imageRows] = await Promise.all([getBlogData(), getFaqData(), getImageData()]);

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
  const imageUrl    = fixImgUrl(post.Image_URL || '');
  const tagList     = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const keywordsStr = tagList.join(', ');

  const imgMap = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^[Ii]mg(\d+)_[Uu][Rr][Ll]$/);
    if (m) imgMap[`img${m[1]}`] = { url: post[key], alt: post[`Img${m[1]}_Alt`] || '' };
  }
  if (imageRows?.length) {
    imageRows
      .filter(r => (r.Blog_Slug || '').trim() === slug)
      .sort((a, b) => Number(a.Img_Number || 0) - Number(b.Img_Number || 0))
      .forEach(r => {
        const num = Number(r.Img_Number || 0);
        if (!num || !r.Img_URL) return;
        imgMap[`img${num}`] = { url: (r.Img_URL || '').trim(), alt: (r.Img_Alt || '').trim() };
      });
  }

  const bodyHTML = renderMarkdown(post.Content || '', imgMap);

  const faqItems = faqRows
    .filter(r => (r.Blog_Slug || '').trim() === slug)
    .sort((a, b) => Number(a.FAQ_Number) - Number(b.FAQ_Number));

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
  ${keywordsStr ? `<meta name="keywords" content="${escHtml(keywordsStr)}">` : ''}
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
    "author": { "@type": "Person", "name": "Suman Dangal", "url": "${SITE_URL}/" }
    ${imageUrl ? `,"image": "${escJson(imageUrl)}"` : ''}
    ${keywordsStr ? `,"keywords": "${escJson(keywordsStr)}"` : ''}
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
  ${tagList.length ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.2rem">${tagList.map(t => `<span style="font-family:monospace;font-size:.7rem;padding:.2rem .55rem;border-radius:.25rem;background:#edf5f0;border:1px solid rgba(45,106,79,.2);color:#2d6a4f">${escHtml(t)}</span>`).join('')}</div>` : ''}
  ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(title)}" width="720" height="400">` : ''}
  <div>${bodyHTML}</div>
  ${faqSectionHTML}
  <hr>
  <p><a href="${SITE_URL}/blog">← Back to all posts</a></p>

  <script>
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
// FIX: All static page URLs now use trailing slashes so they match the canonical
// URLs set in the SPA and prerendered pages. This resolves "Non-canonical URL"
// errors in the site audit (the audit was seeing a mismatch between sitemap
// URLs without trailing slashes and the actual canonical tags on each page).
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
    const l = raw.startsWith('|') ? raw.slice(1) : raw;

    if (l.trim() === '') {
      closeList();
      out.push('<br>');
      continue;
    }
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
    if (l.startsWith('- ')) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inList) { out.push('<ul style="margin:.6rem 0 .6rem 1.4rem;padding:0">'); inList = true; }
      out.push(`<li style="margin-bottom:.35rem">${inlineFmt(l.slice(2))}</li>`);
      continue;
    }
    if (/^\d+\.\s/.test(l)) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inOl) { out.push('<ol style="margin:.6rem 0 .6rem 1.4rem;padding:0">'); inOl = true; }
      out.push(`<li style="margin-bottom:.35rem">${inlineFmt(l.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }
    if (l.startsWith('> ')) {
      closeList();
      out.push(`<blockquote style="border-left:3px solid #52b788;margin:1.2rem 0;padding:.7rem 1rem;background:#edf5f0;border-radius:0 .4rem .4rem 0;color:#2d6a4f;font-style:italic">${inlineFmt(l.slice(2))}</blockquote>`);
      continue;
    }
    const imgMatch = l.trim().match(/^\[img(\d+)\]$/i);
    if (imgMatch && imgMap) {
      closeList();
      const entry = imgMap[`img${imgMatch[1]}`];
      if (entry) {
        const src    = fixImgUrl(typeof entry === 'object' ? entry.url : entry);
        const altTxt = (typeof entry === 'object' && entry.alt) ? entry.alt : `article image ${imgMatch[1]}`;
        if (src) {
          out.push(`<figure style="margin:1.5rem 0"><img src="${escHtml(src)}" alt="${escHtml(altTxt)}" style="max-width:100%;border-radius:.5rem;display:block" loading="lazy"><figcaption style="font-size:.75rem;color:#8a9688;text-align:center;margin-top:.4rem;font-style:italic">${escHtml(altTxt)}</figcaption></figure>`);
        }
      }
      continue;
    }
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
  const rows = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQ && raw[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || (c === '\r' && raw[i+1] === '\n')) && !inQ) {
      if (c === '\r') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some(v => v)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(vals => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}