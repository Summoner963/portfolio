// ═══════════════════════════════════════════════════════════════════════════
//  Suman Dangal — Cloudflare Pages advanced-mode worker (_worker.js)
//   • /api/data?sheet=<name> — named sheet proxy; sheet IDs never reach browser
//   • Every HTML route is the real index.html with per-page SEO tags (and, for
//     blog pages, the content itself) injected server-side via HTMLRewriter
//   • Sheets responses cached (memory + Cache API) with stale fallback
//   • /sitemap.xml, /robots.txt, /llms.txt
//   • *.pages.dev production host → 301 to custom domain; previews noindex
// ═══════════════════════════════════════════════════════════════════════════

// GID map — server-side only. Safe to commit: no secrets here.
// SHEET_ID (the "Publish to web" ID) is a Cloudflare secret.
function getSheetGids(env) {
  return {
    blog:     env.BLOG_GID     || '1132024800',
    skills:   env.SKILLS_GID   || '302402061',
    projects: env.PROJECTS_GID || '0',
    exp:      env.EXP_GID      || '245982630',
    about:    env.ABOUT_GID    || '1066410604',
    faq:      env.FAQ_GID      || '303688554',
    images:   env.IMAGES_GID   || '1267436347',
    featured: env.FEATURED_GID || '980532084',
  };
}

const SITE_URL      = 'https://suman-dangal.com.np';
const DEFAULT_IMAGE = `${SITE_URL}/android-chrome-512x512.png`;
const POSTS_PER_PAGE = 6; // keep in sync with CFG.postsPerPage in index.html

// ── Sheets cache ──────────────────────────────────────────────────────────
const FRESH_MS         = 5 * 60 * 1000;      // serve without refetching
const STALE_KEEP_S     = 7 * 24 * 60 * 60;   // keep last-good copy for outages
const SHEET_TIMEOUT_MS = 4000;               // give up on slow Sheets

const _mem = {}; // per-isolate: { name: { text, at } }

// ── Rate limit (per isolate; use Cloudflare WAF rules for real protection) ─
const RL_WINDOW_MS = 60_000;
const RL_MAX       = 120;
const _rl = {};
function isRateLimited(ip) {
  const now = Date.now();
  const entry = _rl[ip];
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    _rl[ip] = { count: 1, windowStart: now };
    return false;
  }
  entry.count++;
  return entry.count > RL_MAX;
}

// ── Security headers ──────────────────────────────────────────────────────
// 'unsafe-inline' scripts: index.html is one inline-script app and uses
// onload= on the font preload. img-src https: because Sheet rows may point
// images at any host.
const SECURITY_HEADERS = {
  'X-Frame-Options':            'DENY',
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Strict-Transport-Security':  'max-age=31536000',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

// ── Static route metadata ─────────────────────────────────────────────────
const ROUTE_META = {
  '/':           { view: 'home',       title: 'Suman Dangal — Dev & QA Engineer', description: 'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.' },
  '/skills':     { view: 'skills',     title: 'Skills & Stack | Suman Dangal',     description: 'Python, Django, PHP, Java, Android Studio, manual QA testing — skills of Suman Dangal.' },
  '/projects':   { view: 'projects',   title: 'Projects | Suman Dangal',           description: 'Django e-commerce, PHP library system, Android Bluetooth app — projects by Suman Dangal.' },
  '/blog':       { view: 'blog',       title: 'Blog | Suman Dangal',               description: 'Dev notes, QA tips, and tech writing by Suman Dangal — final-year BCA student in Nepal.' },
  '/experience': { view: 'experience', title: 'Experience | Suman Dangal',         description: 'SEO Intern at Sathi Edtech and QA/testing projects — work experience of Suman Dangal.' },
  '/about':      { view: 'about',      title: 'About Suman Dangal',                description: 'BCA student at Tribhuvan University, Bhaktapur, Nepal. Full-stack developer and QA tester.' },
  '/contact':    { view: 'contact',    title: 'Contact | Suman Dangal',            description: 'Get in touch with Suman Dangal for Dev or QA internship opportunities in Nepal.' },
};

const REDIRECTS = {
  '/blog/free-domain-nepal-guide':    '/blog/get-free-domain-in-nepal',
  '/blog/free-domain-in-nepal-guide': '/blog/get-free-domain-in-nepal',
  '/blog/free-domain-in-nepal':       '/blog/get-free-domain-in-nepal',
};

// ─────────────────────────────────────────────────────────────────────────
//  MAIN FETCH HANDLER
// ─────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const host = url.hostname;

    // Duplicate-domain fix: <project>.pages.dev (production) → custom domain.
    // Preview deployments (<hash>.<project>.pages.dev) stay usable but noindex.
    const isPagesDev = host.endsWith('.pages.dev');
    if (isPagesDev && host.split('.').length === 3) {
      return Response.redirect(SITE_URL + url.pathname + url.search, 301);
    }

    const res = await route(request, env, ctx, url);
    return finalize(res, isPagesDev);
  },
};

async function route(request, env, ctx, url) {
  const path   = url.pathname;
  const method = request.method;

  const redirectLookupPath = path.replace(/\/$/, '') || '/';
  if (REDIRECTS[redirectLookupPath]) {
    return Response.redirect(SITE_URL + REDIRECTS[redirectLookupPath], 301);
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const ua = request.headers.get('User-Agent') || '';
  const isSearchCrawler = /googlebot|bingbot|adsbot-google|google-inspectiontool|mediapartners-google/i.test(ua);
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!isSearchCrawler && isRateLimited(clientIP)) {
    return new Response('Too Many Requests', {
      status: 429, headers: { 'Retry-After': '60', 'Content-Type': 'text/plain' },
    });
  }

  if (path === '/api/data')  return handleDataEndpoint(url, env, ctx);
  if (path === '/api/sheet') {
    return new Response('This endpoint is no longer available. Use /api/data?sheet=<name>', { status: 410 });
  }
  if (path === '/sitemap.xml') return generateSitemap(env, ctx);
  if (path === '/robots.txt') {
    return new Response(
      `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      { headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': 'public, max-age=86400' } }
    );
  }
  if (path === '/llms.txt') {
    return new Response(
`# Suman Dangal — Dev & QA Engineer
# ${SITE_URL}/

> Final-year BCA student building and testing full-stack web and mobile applications.
> Open to Dev and QA internship opportunities in Nepal.

## About

Suman Dangal is a final-year BCA student at Tribhuvan University, Bhaktapur, Nepal.
He specializes in full-stack development (Django, PHP, Java Android) and QA/manual testing.

## Pages

- [Home](${SITE_URL}/)
- [Skills](${SITE_URL}/skills/)
- [Projects](${SITE_URL}/projects/)
- [Blog](${SITE_URL}/blog/)
- [Experience](${SITE_URL}/experience/)
- [About](${SITE_URL}/about/)
- [Contact](${SITE_URL}/contact/)

## Contact

- Email: sumandangal888@gmail.com
- LinkedIn: https://linkedin.com/in/sumandangal963
`,
      { status: 200, headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': 'public, max-age=86400' } }
    );
  }
  // Static assets
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|css|js|txt|json|xml|webmanifest|pdf)$/i.test(path)) {
    try {
      const assetResp = await env.ASSETS.fetch(request);
      const headers   = new Headers(assetResp.headers);
      if (/\.(woff2?|ttf|eot)$/i.test(path)) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(assetResp.body, { status: assetResp.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  return servePage(request, env, ctx, url);
}

// Security headers on every response; noindex on preview hosts.
function finalize(res, isPreview) {
  const out = new Response(res.body, res); // unlocks immutable headers
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  if (isPreview) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  Google Sheets — fetch, cache, clean
// ─────────────────────────────────────────────────────────────────────────

// Returns CSV text, or null if Sheets is down and nothing is cached.
async function getSheetCSV(name, env, ctx) {
  const gid = getSheetGids(env)[name];
  if (!gid) return null;

  const mem = _mem[name];
  if (mem && Date.now() - mem.at < FRESH_MS) return mem.text;

  const cacheKey = new Request(`${SITE_URL}/__sheet-cache/${name}`);
  let stale = mem ? mem.text : null;
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) {
      const at   = Number(hit.headers.get('X-Fetched-At')) || 0;
      const text = await hit.text();
      if (Date.now() - at < FRESH_MS) { _mem[name] = { text, at }; return text; }
      stale = text;
    }
  } catch {} // Cache API unavailable (e.g. some *.pages.dev contexts)

  const sheetId = env.SHEET_ID || '';
  if (!sheetId) {
    console.warn('[sheets] SHEET_ID secret not set');
    return stale;
  }
  const sheetUrl = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?gid=${gid}&single=true&output=csv`;

  try {
    const resp = await fetch(sheetUrl, {
      redirect: 'follow',
      signal:   AbortSignal.timeout(SHEET_TIMEOUT_MS),
      headers:  { 'User-Agent': 'Suman-Dangal-Worker/1.0' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    // Google returns an HTML sign-in page if the sheet is unpublished
    if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error('not CSV (sheet unpublished?)');
    const at = Date.now();
    _mem[name] = { text, at };
    const put = caches.default.put(cacheKey, new Response(text, {
      headers: { 'Cache-Control': `public, max-age=${STALE_KEEP_S}`, 'X-Fetched-At': String(at) },
    })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put);
    return text;
  } catch (e) {
    console.warn('[sheets]', name, e.message, stale ? '→ serving stale' : '→ no cache');
    return stale;
  }
}

// Parsed + cleaned rows, or null when Sheets is unavailable.
async function getRows(name, env, ctx) {
  const text = await getSheetCSV(name, env, ctx);
  if (text == null) return null;
  const rows = parseCSV(text);
  return name === 'blog' ? cleanBlogRows(rows) : rows;
}

// Optional "Status" (or "Published") column: draft / unpublished / hidden /
// private / no / false hide the row everywhere. Blank = published.
const HIDDEN_STATUS = /^(draft|unpublished|hidden|private|no|false|0)$/i;
function isPublished(r) {
  return !HIDDEN_STATUS.test((r.Status || r.Published || '').trim());
}
function cleanBlogRows(rows) {
  const seen = new Set();
  return rows.filter(r => {
    const slug = (r.Slug || '').trim();
    if (!slug || !(r.Title || '').trim() || !isPublished(r)) return false;
    if (!/^[a-z0-9][a-z0-9._~-]*$/i.test(slug) || seen.has(slug)) return false;
    seen.add(slug);
    r.Slug = slug;
    return true;
  });
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
//  /api/data?sheet=<name>
// ─────────────────────────────────────────────────────────────────────────
async function handleDataEndpoint(url, env, ctx) {
  const name = (url.searchParams.get('sheet') || '').toLowerCase().trim();
  if (!getSheetGids(env)[name]) return new Response('Not found', { status: 404 });

  let text = await getSheetCSV(name, env, ctx);
  if (text == null) return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '60' } });
  if (name === 'blog') text = toCSV(cleanBlogRows(parseCSV(text))); // drafts never reach the browser

  return new Response(text, {
    headers: {
      'Content-Type':  'text/csv;charset=UTF-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  HTML pages — index.html + HTMLRewriter
// ─────────────────────────────────────────────────────────────────────────
async function servePage(request, env, ctx, url) {
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  let page;

  const postMatch = path.match(/^\/blog\/([^/]+)$/);
  if (path === '/blog')       page = await blogListPage(env, ctx, url);
  else if (postMatch)         page = await blogPostPage(safeDecode(postMatch[1]), env, ctx);
  else if (ROUTE_META[path])  page = basicPage(path);
  else                        page = notFoundPage(path);

  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: { Accept: 'text/html' } }));
  const res = new Response(shell.body, {
    status:  page.status,
    headers: {
      'Content-Type':  'text/html;charset=UTF-8',
      'Cache-Control': page.status === 200 ? 'public, max-age=300, stale-while-revalidate=86400' : 'no-store',
      ...(page.status === 503 ? { 'Retry-After': '120' } : {}),
    },
  });
  return rewriteShell(page).transform(res);
}

function basicPage(path) {
  const m = ROUTE_META[path];
  return { status: 200, view: m.view, title: m.title, description: m.description, canonical: SITE_URL + path, headingSelector: m.view === 'home' ? null : '.section-heading' };
}

function notFoundPage(path, status = 404) {
  return {
    status, view: null, robots: 'noindex, nofollow',
    title: status === 404 ? 'Page Not Found | Suman Dangal' : 'Temporarily Unavailable | Suman Dangal',
    description: 'This page does not exist on suman-dangal.com.np.',
    canonical: SITE_URL + path,
  };
}

async function blogListPage(env, ctx, url) {
  const page  = basicPage('/blog');
  const rows  = (await getRows('blog', env, ctx)) || [];
  const posts = rows.sort((a, b) => dateValue(b.Date) - dateValue(a.Date));
  const total = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  const n     = Math.min(Math.max(1, parseInt(url.searchParams.get('page')) || 1), total);
  const slice = posts.slice((n - 1) * POSTS_PER_PAGE, n * POSTS_PER_PAGE);

  if (n > 1) {
    page.canonical = `${SITE_URL}/blog?page=${n}`;
    page.title = `Blog — Page ${n} | Suman Dangal`;
  }
  page.inject = {
    '#blogGrid': slice.length
      ? slice.map(blogCardHTML).join('')
      : '<p class="empty-state">No posts yet — check back soon.</p>',
    '#blogPagination': total > 1
      ? (n > 1 ? `<a class="btn btn-ghost" href="/blog?page=${n - 1}" data-link>← Prev</a>` : '') +
        `<span>Page ${n} of ${total}</span>` +
        (n < total ? `<a class="btn btn-ghost" href="/blog?page=${n + 1}" data-link>Next →</a>` : '')
      : '',
  };
  page.jsonLd = [{
    '@context': 'https://schema.org', '@type': 'Blog',
    name: 'Suman Dangal Blog', url: `${SITE_URL}/blog`,
    blogPost: posts.map(p => ({ '@type': 'BlogPosting', headline: p.Title, url: `${SITE_URL}/blog/${p.Slug}` })),
  }];
  return page;
}

async function blogPostPage(slug, env, ctx) {
  const [blogRows, faqRows, imageRows] = await Promise.all([
    getRows('blog', env, ctx), getRows('faq', env, ctx), getRows('images', env, ctx),
  ]);
  if (blogRows == null) return notFoundPage(`/blog/${slug}`, 503); // Sheets down — don't claim 404
  const post = blogRows.find(r => r.Slug === slug);
  if (!post) return notFoundPage(`/blog/${slug}`);

  const title     = post.Title;
  const desc      = post.Excerpt || plainExcerpt(post.Content) || ROUTE_META['/blog'].description;
  const canonical = `${SITE_URL}/blog/${slug}`;
  const image     = fixImgUrl(post.Image_URL || '');
  const published = formatDate(post.Date);
  const modified  = formatDate(post.Last_Modified) || published;
  const tags      = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);

  // Inline images: [img1] … from Img1_URL columns and the images sheet
  const imgMap = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^img(\d+)_url$/i);
    if (m && post[key]) imgMap[`img${m[1]}`] = { url: post[key], alt: post[`Img${m[1]}_Alt`] || title };
  }
  (imageRows || [])
    .filter(r => (r.Blog_Slug || '').trim() === slug && r.Img_URL)
    .forEach(r => { const num = Number(r.Img_Number || 0); if (num) imgMap[`img${num}`] = { url: r.Img_URL.trim(), alt: (r.Img_Alt || title).trim() }; });

  const faqs = (faqRows || [])
    .filter(r => (r.Blog_Slug || '').trim() === slug && r.FAQ_Question && r.FAQ_Answer)
    .sort((a, b) => Number(a.FAQ_Number || 0) - Number(b.FAQ_Number || 0));

  // Same markup as renderArticle() in index.html, so hydration doesn't shift layout
  const articleHTML =
    `<button class="article-back" id="artBack">← Back to Blog</button>` +
    `<div class="article-meta"><span class="blog-cat">${escHtml(post.Category || 'Post')}</span>` +
    `<time datetime="${escHtml(post.Date || '')}">${escHtml(post.Date || '')}</time></div>` +
    `<h1 class="article-title">${escHtml(title)}</h1>` +
    (tags.length ? `<div class="article-tags">${tags.map(t => `<span class="article-tag">${escHtml(t)}</span>`).join('')}</div>` : '') +
    (image ? `<img class="article-cover" src="${escHtml(image)}" alt="${escHtml(post.Image_Alt || title + ' featured image')}" loading="eager" decoding="async" fetchpriority="high" width="720" height="420">` : '') +
    `<div class="article-body">${renderMarkdown(post.Content || '', imgMap)}</div>` +
    `<div class="article-author"><span>Written by <a href="/about" data-link>Suman Dangal</a></span></div>` +
    (faqs.length
      ? `<section class="faq-section" aria-label="Frequently Asked Questions"><h2>Frequently Asked Questions</h2>` +
        faqs.map(f => `<details class="faq-item"><summary class="faq-question">${escHtml(f.FAQ_Question)}</summary><div class="faq-answer">${escHtml(f.FAQ_Answer)}</div></details>`).join('') +
        `</section>`
      : '');

  const author = { '@type': 'Person', name: 'Suman Dangal', url: `${SITE_URL}/`, sameAs: ['https://linkedin.com/in/sumandangal963'] };
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: title, description: desc, url: canonical, mainEntityOfPage: canonical,
      image: image || DEFAULT_IMAGE, inLanguage: 'en', author, publisher: author,
      ...(published ? { datePublished: published, dateModified: modified } : {}),
      ...(tags.length ? { keywords: tags.join(', ') } : {}),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
        { '@type': 'ListItem', position: 3, name: title, item: canonical },
      ],
    },
  ];
  if (faqs.length) jsonLd.push({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.FAQ_Question, acceptedAnswer: { '@type': 'Answer', text: f.FAQ_Answer } })),
  });

  const extraHead = [
    published && `<meta property="article:published_time" content="${escHtml(published)}">`,
    modified  && `<meta property="article:modified_time" content="${escHtml(modified)}">`,
    `<meta property="article:author" content="Suman Dangal">`,
    ...tags.map(t => `<meta property="article:tag" content="${escHtml(t)}">`),
  ].filter(Boolean).join('');

  return {
    status: 200, view: 'article', type: 'article',
    title: `${title} | Suman Dangal`, description: desc, canonical,
    image: image || null, jsonLd, extraHead,
    inject: { '#articleWrap': articleHTML }, ssrSlug: slug,
  };
}

function blogCardHTML(post) {
  const img  = fixImgUrl(post.Image_URL || '');
  const tags = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);
  return `<a href="/blog/${escHtml(post.Slug)}" data-link class="blog-card" role="article" aria-label="${escHtml(post.Title)}">` +
    (img
      ? `<div class="blog-card-thumb"><img src="${escHtml(img)}" alt="${escHtml(post.Image_Alt || post.Title + ' cover')}" loading="lazy" decoding="async" width="310" height="172"></div>`
      : `<div class="blog-card-thumb" aria-hidden="true">✍️</div>`) +
    `<div class="blog-card-body"><div class="blog-card-meta"><span class="blog-cat">${escHtml(post.Category || 'Post')}</span>` +
    `<time datetime="${escHtml(post.Date || '')}">${escHtml(post.Date || '')}</time></div>` +
    `<h3 class="blog-card-title">${escHtml(post.Title)}</h3>` +
    `<p class="blog-card-excerpt">${escHtml(post.Excerpt || '')}</p>` +
    (tags.length ? `<div class="blog-card-tags">${tags.map(t => `<span class="blog-tag">${escHtml(t)}</span>`).join('')}</div>` : '') +
    `</div></a>`;
}

// Elements are replaced wholesale (not setAttribute) so escaping is ours.
function rewriteShell(page) {
  const img     = page.image || DEFAULT_IMAGE;
  const ogType  = page.type || 'website';
  const robots  = page.robots || 'index, follow';
  const swap = (sel, html) => [sel, { element(el) { el.replace(html, { html: true }); } }];

  const handlers = [
    swap('title',                            `<title>${escHtml(page.title)}</title>`),
    swap('meta[name="description"]',         `<meta name="description" content="${escHtml(page.description)}" />`),
    swap('meta[name="robots"]',              `<meta name="robots" content="${robots}" />`),
    swap('link#canonical',                   `<link id="canonical" rel="canonical" href="${escHtml(page.canonical)}" />`),
    swap('meta[property="og:type"]',         `<meta property="og:type" content="${ogType}" />`),
    swap('meta[property="og:title"]',        `<meta property="og:title" content="${escHtml(page.title)}" />`),
    swap('meta[property="og:description"]',  `<meta property="og:description" content="${escHtml(page.description)}" />`),
    swap('meta[property="og:url"]',          `<meta property="og:url" content="${escHtml(page.canonical)}" />`),
    swap('meta[property="og:image"]',        `<meta property="og:image" content="${escHtml(img)}" />`),
    swap('meta[name="twitter:card"]',        `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}" />`),
    swap('meta[name="twitter:title"]',       `<meta name="twitter:title" content="${escHtml(page.title)}" />`),
    swap('meta[name="twitter:description"]', `<meta name="twitter:description" content="${escHtml(page.description)}" />`),
    swap('meta[name="twitter:image"]',       `<meta name="twitter:image" content="${escHtml(img)}" />`),
  ];
  // Post cover sizes are unknown — drop the default image's 512×512 hints
  if (page.image) {
    handlers.push(['meta[property="og:image:width"]',  { element(el) { el.remove(); } }]);
    handlers.push(['meta[property="og:image:height"]', { element(el) { el.remove(); } }]);
  }
  // Person schema belongs to the home page; posts carry author inside BlogPosting
  if (page.view !== 'home') {
    handlers.push(['script#static-person-schema', { element(el) { el.remove(); } }]);
  }
  handlers.push(['head', { element(el) {
    const ld = (page.jsonLd || []).map(o => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('');
    el.append((page.extraHead || '') + ld, { html: true });
  } }]);

  if (page.view) {
    handlers.push([`#view-${page.view}`, { element(el) {
      el.setAttribute('class', (el.getAttribute('class') || '') + ' active');
    } }]);
    // One H1: hero heading is the H1 only on home
    if (page.view !== 'home') {
      handlers.push(['#site-h1', { element(el) { el.tagName = 'h2'; } }]);
    }
    if (page.headingSelector) {
      handlers.push([`#view-${page.view} ${page.headingSelector}`, { element(el) { el.tagName = 'h1'; } }]);
    }
  }
  for (const [sel, html] of Object.entries(page.inject || {})) {
    handlers.push([sel, { element(el) {
      el.setInnerContent(html, { html: true });
      if (page.ssrSlug && sel === '#articleWrap') el.setAttribute('data-ssr', page.ssrSlug);
    } }]);
  }

  const rw = new HTMLRewriter();
  for (const [sel, h] of handlers) rw.on(sel, h);
  return rw;
}

// ─────────────────────────────────────────────────────────────────────────
//  Sitemap
// ─────────────────────────────────────────────────────────────────────────
async function generateSitemap(env, ctx) {
  const rows  = await getRows('blog', env, ctx);
  const posts = (rows || []).map(r => ({
    loc: `/blog/${r.Slug}`, priority: '0.8', changefreq: 'monthly',
    lastmod: formatDate(r.Last_Modified) || formatDate(r.Date),
  }));
  const newest = posts.map(p => p.lastmod).filter(Boolean).sort().pop() || null;

  const all = [
    { loc: '/',           priority: '1.0', changefreq: 'monthly' },
    { loc: '/skills',     priority: '0.7', changefreq: 'monthly' },
    { loc: '/projects',   priority: '0.8', changefreq: 'monthly' },
    { loc: '/blog',       priority: '0.9', changefreq: 'weekly', lastmod: newest },
    { loc: '/experience', priority: '0.7', changefreq: 'monthly' },
    { loc: '/about',      priority: '0.6', changefreq: 'monthly' },
    { loc: '/contact',    priority: '0.5', changefreq: 'yearly'  },
    ...posts,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(p => `  <url>
    <loc>${escHtml(SITE_URL + p.loc)}</loc>${p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type':  'application/xml;charset=UTF-8',
      // Short cache if Sheets failed so posts reappear quickly
      'Cache-Control': rows ? 'public, max-age=3600' : 'public, max-age=60',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Markdown renderer (server-side copy of md() in index.html)
// ─────────────────────────────────────────────────────────────────────────
function renderMarkdown(text, imgMap) {
  if (!text) return '';

  function inlineFmt(raw) {
    return escHtml(raw)
      .replace(/&#124;/g, '|')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g,   '<em>$1</em>')
      .replace(/`([^`]+)`/g,     '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  const lines  = text.includes('\n') ? text.split(/\n/) : text.split('|');  
  const out    = [];
  let inList   = false;
  let inOl     = false;
  let inPre    = false;

  function closeList() {
    if (inList) { out.push('</ul>'); inList = false; }
    if (inOl)   { out.push('</ol>'); inOl   = false; }
  }

  for (const raw of lines) {
    const l = raw.startsWith('|') ? raw.slice(1) : raw;

    if (l.trim() === '```') {
      if (inPre) { out.push('</code></pre>'); inPre = false; }
      else { closeList(); out.push('<pre><code>'); inPre = true; }
      continue;
    }
    if (inPre) { out.push(escHtml(raw)); continue; }

    if (l.trim() === '')          { closeList(); out.push(''); continue; }
    if (l.startsWith('## '))      { closeList(); out.push(`<h2>${inlineFmt(l.slice(3))}</h2>`); continue; }
    if (l.startsWith('### '))     { closeList(); out.push(`<h3>${inlineFmt(l.slice(4))}</h3>`); continue; }
    if (l.startsWith('> '))       { closeList(); out.push(`<blockquote><p>${inlineFmt(l.slice(2))}</p></blockquote>`); continue; }
    if (l.startsWith('- '))       {
      if (inOl)  { out.push('</ol>'); inOl   = false; }
      if (!inList){ out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFmt(l.slice(2))}</li>`); continue;
    }
    if (/^\d+\.\s/.test(l))      {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inOl)  { out.push('<ol>'); inOl   = true; }
      out.push(`<li>${inlineFmt(l.replace(/^\d+\.\s/, ''))}</li>`); continue;
    }

    // Inline image placeholders [img1], [img2] …
    const imgMatch = l.trim().match(/^\[img(\d+)\]$/i);
    if (imgMatch && imgMap) {
      closeList();
      const entry = imgMap[`img${imgMatch[1]}`];
      if (entry) {
        const src    = fixImgUrl(typeof entry === 'object' ? entry.url : entry);
        const altTxt = (typeof entry === 'object' && entry.alt) ? entry.alt : `image ${imgMatch[1]}`;
        if (src) {
          out.push(
            `<figure class="blog-figure"><img class="blog-inline-img" src="${escHtml(src)}" alt="${escHtml(altTxt)}" ` +
            `width="680" height="383" loading="lazy" decoding="async">` +
            `<figcaption>${escHtml(altTxt)}</figcaption></figure>`
          );
        }
      }
      continue;
    }

    closeList();
    out.push(`<p>${inlineFmt(l)}</p>`);
  }
  if (inPre)  out.push('</code></pre>');
  closeList();
  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
//  CSV parser
// ─────────────────────────────────────────────────────────────────────────
function parseCSV(raw) {
  const rows = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQ && raw[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || (c === '\r' && raw[i + 1] === '\n')) && !inQ) {
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
  return rows.slice(1)
    .map(vals => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v));
}

// ─────────────────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// JSON for <script type="application/ld+json">: can't break out of the tag
function jsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function plainExcerpt(md) {
  const t = String(md || '').replace(/\[img\d+\]/gi, ' ').replace(/[#>*`|_\[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 155 ? t.slice(0, 152).replace(/\s\S*$/, '') + '…' : t;
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
  return /^https?:\/\//i.test(url) ? url : '';
}
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
function dateValue(s) {
  const t = new Date(s || 0).getTime();
  return isNaN(t) ? 0 : t;
}
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}
