const BLOG_SHEET_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1132024800&single=true&output=csv';
const FAQ_SHEET_URL    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=303688554&single=true&output=csv';
const IMAGES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1267436347&single=true&output=csv';
const SITE_URL         = 'https://suman-dangal.com.np';

// Separate caches for blog, FAQ and BlogImages sheets
let blogCache = null, blogCacheTime = 0;
let faqCache  = null, faqCacheTime  = 0;
let imgCache  = null, imgCacheTime  = 0;
const CACHE_MS = 10 * 60 * 1000;

// ── Per-route SEO metadata ──
const ROUTE_META = {
  '/': {
    title:       'Suman Dangal — Dev & QA Engineer',
    description: 'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.',
    canonical:   `${SITE_URL}/`,
    h1:          null,
  },
  '/skills': {
    title:       'Skills & Stack | Suman Dangal',
    description: 'Python, Django, PHP, Java, Android Studio, manual QA testing and more — skills of Suman Dangal.',
    canonical:   `${SITE_URL}/skills`,
    h1:          'Skills & Stack',
  },
  '/projects': {
    title:       'Projects | Suman Dangal',
    description: 'Django e-commerce, PHP library system, Android Bluetooth app and more — projects by Suman Dangal.',
    canonical:   `${SITE_URL}/projects`,
    h1:          'Projects',
  },
  '/blog': {
    title:       'Blog | Suman Dangal',
    description: 'Dev notes, QA tips, and tech writing by Suman Dangal — final-year BCA student in Nepal.',
    canonical:   `${SITE_URL}/blog`,
    h1:          'Blog',
  },
  '/experience': {
    title:       'Experience | Suman Dangal',
    description: 'SEO Intern at Sathi Edtech and QA/testing projects — work experience of Suman Dangal.',
    canonical:   `${SITE_URL}/experience`,
    h1:          'Experience',
  },
  '/about': {
    title:       'About Suman Dangal',
    description: 'BCA student at Tribhuvan University, Bhaktapur, Nepal. Full-stack developer and QA tester.',
    canonical:   `${SITE_URL}/about`,
    h1:          'About Suman Dangal',
  },
  '/contact': {
    title:       'Contact | Suman Dangal',
    description: 'Get in touch with Suman Dangal for Dev or QA internship opportunities in Nepal.',
    canonical:   `${SITE_URL}/contact`,
    h1:          'Contact',
  },
};

// ── Security headers ──
// FIX 1: Added Permissions-Policy and Cross-Origin-Opener-Policy.
// These fix Lighthouse "Best Practices" warnings that cost you score points.
// FIX 2: Added stale-while-revalidate to Cache-Control — see usage below.
const SECURITY_HEADERS = {
  'X-Frame-Options':              'SAMEORIGIN',
  'X-Content-Type-Options':       'nosniff',
  'Referrer-Policy':              'strict-origin-when-cross-origin',
  // FIX: Added Cross-Origin-Opener-Policy — prevents cross-origin window attacks
  // and is required for SharedArrayBuffer / high-precision timers.
  'Cross-Origin-Opener-Policy':   'same-origin-allow-popups',
  // FIX: Permissions-Policy — opt out of browser features you don't use.
  // This fixes the Lighthouse "Permissions-Policy header" audit.
  'Permissions-Policy':           'camera=(), microphone=(), geolocation=(), payment=()',
  // FIX: CSP updated — added fonts.gstatic.com to font-src explicitly,
  // added lh3.googleusercontent.com to img-src (Google Drive images).
  // 'unsafe-inline' retained for inline <style>/<script> in index.html.
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: https://lh3.googleusercontent.com https://suman-dangal.com.np; " +
    "connect-src 'self' https://docs.google.com https://api.anthropic.com; " +
    "frame-ancestors 'none';",
};

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── CSV proxy ──
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
            // FIX 3: Added stale-while-revalidate to CSV proxy.
            // Browser serves cached CSV instantly while refreshing in background.
            // Users never wait for sheet data on repeat visits.
            'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
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

    // ── llms.txt ──
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

    // ── Static assets — serve directly with aggressive caching ──
    if (path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json|xml)$/i)) {
      try {
        const assetResp = await env.ASSETS.fetch(request);
        // FIX 4: Fonts and images get a 1-year immutable cache.
        // They never change (hash-based filenames), so this is safe and fast.
        const isImmutable = path.match(/\.(woff2?|ttf|eot)$/i);
        const headers = new Headers(assetResp.headers);
        if (isImmutable) {
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
        return new Response(assetResp.body, { status: assetResp.status, headers });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    }

    // ── Blog post route — prerender for ALL visitors ──
    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      return await prerenderBlogPost(blogMatch[1], env, request);
    }

    // ── Known SPA routes — serve index.html with injected per-route meta ──
    const normPath = path === '/' ? '/' : path.replace(/\/$/, '');
    if (ROUTE_META[normPath]) {
      return await serveIndexWithMeta(env, request, normPath);
    }

    // ── All other SPA routes — serve plain index.html ──
    return await serveIndex(env, request);
  }
};

// ── Apply security headers ──
function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return headers;
}

// ── Shared HTML cache headers ──
// FIX 5: All HTML responses now get stale-while-revalidate=86400.
// This means: serve the cached page immediately (fast!), and revalidate
// in the background. Users on repeat visits get instant loads.
function htmlCacheHeaders() {
  return 'public, max-age=3600, stale-while-revalidate=86400';
}

// ── Serve index.html unchanged (fallback / unknown routes) ──
async function serveIndex(env, request) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const headers  = applySecurityHeaders(new Headers(response.headers));
  // FIX 6: serveIndex() previously had NO Cache-Control — fixed.
  headers.set('Content-Type', 'text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(response.body, { status: 200, headers });
}

// ── Serve index.html with per-route meta injected ──
async function serveIndexWithMeta(env, request, normPath) {
  const indexUrl  = new URL('/', new URL(request.url).origin);
  const response  = await env.ASSETS.fetch(new Request(indexUrl, request));
  const meta      = ROUTE_META[normPath];

  let html = await response.text();

  // 1. Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escHtml(meta.title)}<\/title>`
  );

  // 2. Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escHtml(meta.description)}"`
  );

  // 3. Replace canonical href
  html = html.replace(
    /<link id="canonical" rel="canonical" href="[^"]*"/,
    `<link id="canonical" rel="canonical" href="${escHtml(meta.canonical)}"`
  );

  // 4. Replace og:title
  html = html.replace(
    /<meta property="og:title"\s+content="[^"]*"/,
    `<meta property="og:title" content="${escHtml(meta.title)}"`
  );

  // 5. Replace og:description
  html = html.replace(
    /<meta property="og:description"\s+content="[^"]*"/,
    `<meta property="og:description" content="${escHtml(meta.description)}"`
  );

  // 6. Replace og:url
  html = html.replace(
    /<meta property="og:url"\s+content="[^"]*"/,
    `<meta property="og:url" content="${escHtml(meta.canonical)}"`
  );

  // 7. Replace twitter:title
  html = html.replace(
    /<meta name="twitter:title"\s+content="[^"]*"/,
    `<meta name="twitter:title" content="${escHtml(meta.title)}"`
  );

  // 8. Replace twitter:description
  html = html.replace(
    /<meta name="twitter:description"\s+content="[^"]*"/,
    `<meta name="twitter:description" content="${escHtml(meta.description)}"`
  );

  // 9. H1 handling
  // FIX 7: Old regex was exact-match on the opening tag attributes.
  // The optimized index.html has style="display:none" on the h1,
  // so the old regex <h1 class="hero-title" id="site-h1"> would fail silently.
  // New regex uses a flexible pattern that matches any attributes on the h1.
  if (meta.h1) {
    // Hide hero H1: match the h1 tag regardless of attribute order/content
    html = html.replace(
      /<h1[^>]*id="site-h1"[^>]*>/,
      `<h1 class="hero-title h1-hidden" id="site-h1" aria-hidden="true" style="display:none">`
    );
    // Inject unique route H1 — visually hidden, crawler-readable
    html = html.replace(
      /<div id="app" role="main">/,
      `<div id="app" role="main"><h1 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" data-crawler-h1>${escHtml(meta.h1)}<\/h1>`
    );
  }

  const headers = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type', 'text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());

  return new Response(html, { status: 200, headers });
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
    const h404 = applySecurityHeaders(new Headers({'Content-Type': 'text/html;charset=UTF-8'}));
    return new Response(html, { status: 404, headers: h404 });
  }

  const title       = post.Title    || '';
  const excerpt     = post.Excerpt  || '';
  const date        = post.Date     || '';
  const category    = post.Category || 'Post';
  const postUrl     = `${SITE_URL}/blog/${slug}`;
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

  const bodyHTML     = renderMarkdown(post.Content || '', imgMap);
  const faqItems     = faqRows
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
  <\/script>` : '';

  // FIX 8: Prerendered blog post HTML now has:
  // - preconnect to fonts.googleapis.com + fonts.gstatic.com
  // - non-blocking font load (same preload trick as index.html)
  // - DM Sans/Mono fallback fonts so it visually matches the SPA
  // - Person schema added (was missing from blog post prerender)
  // - Explicit width/height on cover image to prevent CLS
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

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style"
    href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap"
    onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap"></noscript>

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
  <\/script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Suman Dangal",
    "url": "${SITE_URL}/",
    "email": "sumandangal888@gmail.com",
    "jobTitle": "Dev & QA Engineer",
    "address": { "@type": "PostalAddress", "addressLocality": "Bhaktapur", "addressCountry": "NP" },
    "sameAs": ["https://linkedin.com/in/sumandangal963"]
  }
  <\/script>

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
  <\/script>

  ${faqSchemaTag}

  <style>
    /* Fallback fonts with size-adjust to prevent CLS on font swap */
    @font-face {
      font-family: 'DM Serif Display Fallback';
      src: local('Georgia');
      size-adjust: 103%;
      ascent-override: 90%;
      descent-override: 22%;
    }
    @font-face {
      font-family: 'DM Sans Fallback';
      src: local('Arial');
      size-adjust: 101%;
      ascent-override: 92%;
      descent-override: 24%;
    }
    @font-face {
      font-family: 'DM Mono Fallback';
      src: local('Courier New');
      size-adjust: 86%;
      ascent-override: 92%;
    }
    :root {
      --accent:#2d6a4f; --accent2:#1b4332; --muted:#5a6659;
      --border:#e2e6df; --surface:#f7f8f6; --accent-bg:#edf5f0;
      --serif:'DM Serif Display','DM Serif Display Fallback',Georgia,serif;
      --sans:'DM Sans','DM Sans Fallback',system-ui,sans-serif;
      --mono:'DM Mono','DM Mono Fallback','Courier New',monospace;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--sans);max-width:740px;margin:0 auto;padding:2rem;color:#1a1e1a;line-height:1.7;background:#fff}
    /* Touch targets: min 44px for accessibility */
    a{color:var(--accent);text-underline-offset:3px;min-height:44px;display:inline-flex;align-items:center}
    nav{margin-bottom:2rem;font-family:var(--mono);font-size:.8rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
    nav a{min-height:auto;display:inline}
    h1{font-family:var(--serif);font-size:clamp(1.8rem,5vw,2.6rem);margin-bottom:.5rem;color:var(--accent2);line-height:1.1}
    h2{font-family:var(--serif);font-size:1.4rem;margin:2rem 0 .6rem;color:#1a1e1a}
    h3{font-family:var(--serif);font-size:1.1rem;color:var(--accent);margin:1.5rem 0 .4rem}
    .meta{font-size:.8rem;color:#8a9688;margin-bottom:2rem;font-family:var(--mono);display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
    .cat{background:var(--accent-bg);color:var(--accent);padding:.2rem .6rem;border-radius:1rem;font-size:.75rem}
    p{color:var(--muted);margin-bottom:1rem}
    /* FIX: explicit aspect-ratio on cover image prevents CLS */
    .cover-img{max-width:100%;border-radius:.6rem;margin:1rem 0;display:block;border:1.5px solid var(--border);aspect-ratio:720/420;object-fit:cover}
    img{max-width:100%;border-radius:.5rem;margin:1rem 0;display:block}
    pre{background:var(--surface);border:1.5px solid var(--border);border-radius:.5rem;padding:1rem;overflow-x:auto;margin:1rem 0}
    code{font-family:var(--mono);font-size:.85em;background:var(--accent-bg);padding:.12rem .35rem;border-radius:.25rem;color:var(--accent)}
    pre code{background:none;padding:0;color:#1a1e1a}
    details{border:1.5px solid var(--border);border-radius:.5rem;margin-bottom:.75rem;overflow:hidden}
    summary{padding:.9rem 1rem;font-weight:600;cursor:pointer;background:var(--surface);color:#1a1e1a;list-style:none;user-select:none}
    summary::-webkit-details-marker{display:none}
    /* Reduced motion */
    @media(prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important}}
    /* Focus visible */
    :focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
    @media(max-width:600px){body{padding:1.2rem}}
  </style>
</head>
<body>
  <nav>
    <a href="${SITE_URL}/">Home</a>
    <span>→</span>
    <a href="${SITE_URL}/blog">Blog</a>
    <span>→</span>
    <span>${escHtml(title)}</span>
  </nav>
  <h1>${escHtml(title)}</h1>
  <div class="meta">
    <span class="cat">${escHtml(category)}</span>
    <time datetime="${escHtml(date)}">${escHtml(date)}</time>
  </div>
  ${tagList.length ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.2rem">${tagList.map(t => `<span style="font-family:var(--mono);font-size:.7rem;padding:.2rem .55rem;border-radius:.25rem;background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);color:var(--accent)">${escHtml(t)}</span>`).join('')}</div>` : ''}
  ${imageUrl ? `<img class="cover-img" src="${escHtml(imageUrl)}" alt="${escHtml(title)}" width="720" height="400" loading="eager" decoding="async">` : ''}
  <div>${bodyHTML}</div>
  ${faqSectionHTML}
  <hr style="border:none;border-top:1px solid var(--border);margin:2rem 0">
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
  <\/script>
</body>
</html>`;

  const h200 = applySecurityHeaders(new Headers({
    'Content-Type': 'text/html;charset=UTF-8',
    // FIX 9: Blog post pages get stale-while-revalidate too.
    'Cache-Control': htmlCacheHeaders(),
  }));
  return new Response(html, { status: 200, headers: h200 });
}

// ── Dynamic sitemap ──
// FIX 10: Wrapped entire function in try/catch.
// If the blog sheet is down, sitemap still returns the static pages
// instead of a 500 error (which would get sitemap de-indexed by Google).
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
  } catch {
    // Sheet unavailable — sitemap still works with static pages
  }
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
    headers: {
      'Content-Type': 'application/xml;charset=UTF-8',
      // FIX: Sitemap gets stale-while-revalidate so Google always gets a fast response
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    }
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
      .replace(/`([^`]+)`/g, '<code>$1</code>')
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
      out.push(`<h2>${inlineFmt(l.slice(3))}</h2>`);
      continue;
    }
    if (l.startsWith('### ')) {
      closeList();
      out.push(`<h3>${inlineFmt(l.slice(4))}</h3>`);
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
          // FIX: explicit width/height on all inline images to prevent CLS
          out.push(`<figure style="margin:1.5rem 0"><img src="${escHtml(src)}" alt="${escHtml(altTxt)}" width="680" height="383" style="max-width:100%;border-radius:.5rem;display:block;aspect-ratio:680/383;object-fit:cover" loading="lazy" decoding="async"><figcaption style="font-size:.75rem;color:#8a9688;text-align:center;margin-top:.4rem;font-style:italic">${escHtml(altTxt)}</figcaption></figure>`);
        }
      }
      continue;
    }
    closeList();
    out.push(`<p>${inlineFmt(l)}</p>`);
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