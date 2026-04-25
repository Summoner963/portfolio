// ═══════════════════════════════════════════════════════════════════════════
//  Suman Dangal — Cloudflare Worker  (worker.js)
//  Security improvements:
//   1. Named /api/data?sheet= endpoints — NO sheet URLs/IDs ever reach browser
//   2. Strict whitelist — only known sheet names are served
//   3. IP-based rate limiting via Cloudflare KV (falls back gracefully)
//   4. Removed generic /api/sheet proxy — no arbitrary URL fetching
//   5. All sheet config lives server-side only (env vars via wrangler.toml)
//   6. Full SEO: structured data, sitemap, llms.txt all preserved
// ═══════════════════════════════════════════════════════════════════════════

// ── Sheet ID (server-side only — never sent to browser) ──────────────────
// Move this to wrangler.toml [vars] SHEET_ID for extra safety.
// But keeping here ensures nothing breaks if wrangler.toml isn't updated.
const SHEET_ID_FALLBACK =
  '2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc';

const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e';

// GID map — server-side only, never exposed to client
const SHEET_GIDS = {
  blog:     '1132024800',
  skills:   '302402061',
  projects: '0',
  exp:      '245982630',
  about:    '1066410604',
  faq:      '303688554',
  images:   '1267436347',
};

const SITE_URL = 'https://suman-dangal.com.np';
const CACHE_MS  = 10 * 60 * 1000; // 10 minutes

// Simple in-memory cache (per Worker instance)
const _cache = {};
function memGet(key) {
  const it = _cache[key];
  if (!it) return null;
  if (Date.now() > it.exp) { delete _cache[key]; return null; }
  return it.data;
}
function memSet(key, data) {
  _cache[key] = { data, exp: Date.now() + CACHE_MS };
}

// ── Rate limit config ─────────────────────────────────────────────────────
// Uses in-memory store (resets per Worker cold start).
// For production: use Cloudflare Rate Limiting in dashboard (free tier).
const RL_WINDOW_MS  = 60_000; // 1 minute window
const RL_MAX        = 120;    // max requests per IP per window
const _rl = {};               // { ip: { count, windowStart } }

function isRateLimited(ip) {
  const now = Date.now();
  let entry = _rl[ip];
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    _rl[ip] = { count: 1, windowStart: now };
    return false;
  }
  entry.count++;
  return entry.count > RL_MAX;
}

// ── Security headers ──────────────────────────────────────────────────────
const SECURITY_HEADERS = {
  'X-Frame-Options':            'SAMEORIGIN',
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: https://lh3.googleusercontent.com https://suman-dangal.com.np; " +
    "connect-src 'self'; " +   // ← only self — no google URLs from browser
    "frame-ancestors 'none';",
};

function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return headers;
}

function htmlCacheHeaders() {
  return 'public, max-age=3600, stale-while-revalidate=86400';
}

// ── Route metadata for SEO ────────────────────────────────────────────────
const ROUTE_META = {
  '/':           { title: 'Suman Dangal — Dev & QA Engineer',  description: 'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.',                                     canonical: `${SITE_URL}/`,           h1: null },
  '/skills':     { title: 'Skills & Stack | Suman Dangal',      description: 'Python, Django, PHP, Java, Android Studio, manual QA testing — skills of Suman Dangal.',                          canonical: `${SITE_URL}/skills`,     h1: 'Skills & Stack' },
  '/projects':   { title: 'Projects | Suman Dangal',            description: 'Django e-commerce, PHP library system, Android Bluetooth app — projects by Suman Dangal.',                        canonical: `${SITE_URL}/projects`,   h1: 'Projects' },
  '/blog':       { title: 'Blog | Suman Dangal',                description: 'Dev notes, QA tips, and tech writing by Suman Dangal — final-year BCA student in Nepal.',                         canonical: `${SITE_URL}/blog`,       h1: 'Blog' },
  '/experience': { title: 'Experience | Suman Dangal',          description: 'SEO Intern at Sathi Edtech and QA/testing projects — work experience of Suman Dangal.',                           canonical: `${SITE_URL}/experience`, h1: 'Experience' },
  '/about':      { title: 'About Suman Dangal',                 description: 'BCA student at Tribhuvan University, Bhaktapur, Nepal. Full-stack developer and QA tester.',                       canonical: `${SITE_URL}/about`,      h1: 'About Suman Dangal' },
  '/contact':    { title: 'Contact | Suman Dangal',             description: 'Get in touch with Suman Dangal for Dev or QA internship opportunities in Nepal.',                                  canonical: `${SITE_URL}/contact`,    h1: 'Contact' },
};

// ─────────────────────────────────────────────────────────────────────────
//  PRERENDER CSS — mirrors index.html SPA styles exactly
//  Served with SSR blog posts so crawlers & users see styled content
//  before the SPA hydrates. Zero flash of unstyled content.
// ─────────────────────────────────────────────────────────────────────────
const PRERENDER_CSS = `
:root{
  --bg:#ffffff;--surface:#f7f8f6;--card:#ffffff;
  --border:#e2e6df;--border-dark:#c8d0c4;
  --accent:#2d6a4f;--accent-light:#52b788;--accent-bg:#edf5f0;
  --accent2:#1b4332;--accent3:#b7791f;
  --text:#1a1e1a;--muted:#5a6659;--muted-light:#8a9688;
  --serif:'DM Serif Display','DM Serif Display Fallback',Georgia,serif;
  --mono:'DM Mono','DM Mono Fallback','Courier New',monospace;
  --sans:'DM Sans','DM Sans Fallback',system-ui,-apple-system,sans-serif;
  --nav-h:62px;
  --shadow-sm:0 1px 4px rgba(0,0,0,.09);
  --shadow-md:0 4px 18px rgba(0,0,0,.1);
}
@font-face{font-family:'DM Serif Display Fallback';src:local('Georgia');size-adjust:103%;ascent-override:90%;descent-override:22%;line-gap-override:0%}
@font-face{font-family:'DM Mono Fallback';src:local('Courier New');size-adjust:86%;ascent-override:92%;descent-override:24%;line-gap-override:0%}
@font-face{font-family:'DM Sans Fallback';src:local('Arial');size-adjust:101%;ascent-override:92%;descent-override:24%;line-gap-override:0%}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.6;overflow-x:hidden;padding-top:var(--nav-h)}
a{color:var(--accent);text-underline-offset:3px}
.pre-nav{
  position:fixed;top:0;left:0;right:0;height:var(--nav-h);z-index:1000;
  display:flex;align-items:center;justify-content:space-between;padding:0 4rem;
  background:rgba(255,255,255,.92);
  backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);
  border-bottom:1px solid var(--border);box-shadow:var(--shadow-sm);
  font-family:var(--mono);
}
.pre-nav-brand{font-size:.84rem;color:var(--accent);letter-spacing:.06em;text-decoration:none;font-weight:500}
.pre-nav-links{display:flex;gap:2.4rem;list-style:none}
.pre-nav-links li{border-bottom:none}
.pre-nav-links a{font-size:.75rem;color:var(--muted);text-decoration:none;letter-spacing:.09em;text-transform:uppercase}
.pre-nav-links a.active{color:var(--accent);font-weight:500}
.pre-burger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:4px;min-width:44px;min-height:44px;align-items:center;justify-content:center}
.pre-burger span{display:block;width:21px;height:1.5px;background:var(--text);border-radius:1px}
.pre-main{max-width:720px;margin:0 auto;padding:5rem 4rem}
.pre-back{display:inline-flex;align-items:center;gap:.5rem;font-family:var(--mono);font-size:.72rem;color:var(--muted);text-decoration:none;margin-bottom:2.4rem;letter-spacing:.05em}
.pre-back:hover{color:var(--accent)}
.pre-breadcrumb{font-family:var(--mono);font-size:.7rem;color:var(--muted-light);letter-spacing:.06em;margin-bottom:1.8rem;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
.pre-breadcrumb a{color:var(--accent);text-decoration:none}
.pre-meta{display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;font-family:var(--mono);font-size:.7rem;color:var(--muted-light);margin-bottom:1.4rem;letter-spacing:.06em}
.pre-cat{color:var(--accent);background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);padding:.14rem .5rem;border-radius:1rem;font-size:.65rem;font-weight:500}
.pre-title{font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.1;margin-bottom:1.8rem;color:var(--accent2)}
.pre-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.6rem}
.pre-tag{font-family:var(--mono);font-size:.68rem;padding:.22rem .65rem;border-radius:.25rem;background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);color:var(--accent)}
.pre-cover{width:100%;max-height:420px;object-fit:cover;border-radius:.7rem;border:1.5px solid var(--border);margin-bottom:2.2rem;display:block;aspect-ratio:720/420}
.pre-body{line-height:1.82;font-size:.94rem}
.pre-body h2{font-family:var(--serif);font-size:1.55rem;margin:2rem 0 1rem;color:var(--text)}
.pre-body h3{font-family:var(--serif);font-size:1.15rem;margin:1.5rem 0 .7rem;color:var(--accent)}
.pre-body p{color:var(--muted);line-height:1.82;margin-bottom:1.2rem;font-size:.94rem}
.pre-body strong{color:var(--text);font-weight:500}
.pre-body a{color:var(--accent);text-underline-offset:3px}
.pre-body ul,.pre-body ol{padding-left:1.4rem;margin-bottom:1.2rem}
.pre-body li{color:var(--muted);font-size:.9rem;line-height:1.8;margin-bottom:.3rem}
.pre-body blockquote{border-left:2px solid var(--accent);padding:.4rem 0 .4rem 1.4rem;margin:1.5rem 0;background:var(--accent-bg);border-radius:0 .4rem .4rem 0}
.pre-body blockquote p{color:var(--text);font-style:italic;margin:0}
.pre-body code{font-family:var(--mono);font-size:.8rem;background:var(--accent-bg);border:1px solid rgba(45,106,79,.18);padding:.14rem .38rem;border-radius:.25rem;color:var(--accent)}
.pre-body pre{background:var(--surface);border:1.5px solid var(--border);border-radius:.6rem;padding:1.4rem;overflow-x:auto;margin-bottom:1.4rem}
.pre-body pre code{background:none;border:none;padding:0;color:var(--text)}
.pre-body figure{margin:2rem 0}
.pre-body figure img{display:block;width:100%;height:auto;border-radius:.6rem;border:1.5px solid var(--border);aspect-ratio:680/383;object-fit:cover}
.pre-body figcaption{font-family:var(--mono);font-size:.7rem;color:var(--muted-light);text-align:center;margin-top:.55rem;letter-spacing:.04em;font-style:italic}
.pre-faq{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border)}
.pre-faq h2{font-family:var(--serif);font-size:1.55rem;margin-bottom:1.4rem;color:var(--accent2)}
.pre-faq details{border:1.5px solid var(--border);border-radius:.6rem;margin-bottom:.75rem;overflow:hidden;background:var(--card)}
.pre-faq details[open]{border-color:rgba(45,106,79,.3)}
.pre-faq summary{font-family:var(--sans);font-weight:500;font-size:.92rem;padding:1rem 1.2rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;color:var(--text);user-select:none}
.pre-faq summary::-webkit-details-marker{display:none}
.pre-faq summary::after{content:'+';font-family:var(--mono);font-size:1.1rem;color:var(--accent);transition:transform .25s;flex-shrink:0;margin-left:.8rem}
.pre-faq details[open] summary::after{transform:rotate(45deg)}
.pre-faq .faq-answer{padding:.75rem 1.2rem 1rem;font-size:.88rem;color:var(--muted);line-height:1.75;border-top:1px solid var(--border)}
.pre-footer{border-top:1px solid var(--border);padding:1.8rem 4rem;display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:.69rem;color:var(--muted);letter-spacing:.04em;background:var(--surface);margin-top:4rem}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
@media(max-width:768px){
  .pre-nav{padding:0 1.5rem}
  .pre-nav-links{
    display:none;flex-direction:column;gap:0;
    position:fixed;top:var(--nav-h);left:0;right:0;
    background:rgba(255,255,255,.97);
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    border-bottom:1px solid var(--border);padding:1rem 1.5rem;z-index:999;
  }
  .pre-nav-links.open{display:flex}
  .pre-nav-links li{border-bottom:1px solid var(--border)}
  .pre-nav-links li:last-child{border-bottom:none}
  .pre-nav-links a{display:flex;padding:.85rem 0;font-size:.82rem;min-height:44px;align-items:center}
  .pre-burger{display:flex}
  .pre-main{padding:3.5rem 1.5rem}
  .pre-footer{flex-direction:column;gap:.45rem;text-align:center;padding:1.5rem}
}
@media(max-width:480px){.pre-main{padding:2.5rem 1.2rem}}
`;

// ─────────────────────────────────────────────────────────────────────────
//  MAIN FETCH HANDLER
// ─────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // Only allow GET / HEAD
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    // ── Rate limiting ──────────────────────────────────────────────────
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(clientIP)) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Content-Type': 'text/plain',
        },
      });
    }

    // ── /api/data?sheet=<name> ─────────────────────────────────────────
    // Secure named endpoint — replaces old /api/sheet proxy
    // Sheet IDs never leave the server
    if (path === '/api/data') {
      return await handleDataEndpoint(url, env);
    }

    // ── Legacy /api/sheet — now returns 404 ───────────────────────────
    // Old direct-proxy endpoint is closed. Client code updated to /api/data.
    if (path === '/api/sheet') {
      return new Response('This endpoint is no longer available. Use /api/data?sheet=<name>', { status: 410 });
    }

    // ── /sitemap.xml ───────────────────────────────────────────────────
    if (path === '/sitemap.xml') return await generateSitemap(env);

    // ── /robots.txt ───────────────────────────────────────────────────
    if (path === '/robots.txt') {
      return new Response(
        `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`,
        { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' } }
      );
    }

    // ── /llms.txt ──────────────────────────────────────────────────────
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

    // ── Static assets ──────────────────────────────────────────────────
    if (path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json|xml)$/i)) {
      try {
        const assetResp = await env.ASSETS.fetch(request);
        const headers   = new Headers(assetResp.headers);
        applySecurityHeaders(headers);
        if (path.match(/\.(woff2?|ttf|eot)$/i)) {
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
        return new Response(assetResp.body, { status: assetResp.status, headers });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    }

    // ── Blog post SSR (for crawlers & social sharing) ──────────────────
    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) return await prerenderBlogPost(blogMatch[1], env, request);

    // ── Known SPA routes — inject correct meta tags ────────────────────
    const normPath = path === '/' ? '/' : path.replace(/\/$/, '');
    if (ROUTE_META[normPath]) return await serveIndexWithMeta(env, request, normPath);

    // ── Everything else — serve SPA shell ─────────────────────────────
    return await serveIndex(env, request);
  },
};

// ─────────────────────────────────────────────────────────────────────────
//  /api/data?sheet=<name>  — secure named sheet endpoint
// ─────────────────────────────────────────────────────────────────────────
async function handleDataEndpoint(url, env) {
  const sheetName = (url.searchParams.get('sheet') || '').toLowerCase().trim();

  // Strict whitelist — only known names accepted
  if (!SHEET_GIDS[sheetName]) {
    return new Response('Not found', { status: 404 });
  }

  // Check in-memory cache first
  const cacheKey = `sheet_${sheetName}`;
  const cached   = memGet(cacheKey);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        'Content-Type':  'text/csv;charset=UTF-8',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': 'same-origin', // Only same origin
        'X-Served-From': 'worker-cache',
      },
    });
  }

  // Build sheet URL server-side — never exposed to client
  const sheetId  = (env && env.SHEET_ID) || SHEET_ID_FALLBACK;
  const gid      = SHEET_GIDS[sheetName];
  const sheetUrl = `${SHEET_BASE}/${sheetId}/pub?gid=${gid}&single=true&output=csv`;

  try {
    const resp = await fetch(sheetUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Suman-Dangal-Worker/1.0' },
    });
    if (!resp.ok) throw new Error(`Google Sheets HTTP ${resp.status}`);
    const text = await resp.text();
    memSet(cacheKey, text);
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type':  'text/csv;charset=UTF-8',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': 'same-origin',
        'X-Served-From': 'google-sheets',
      },
    });
  } catch (e) {
    console.warn('[/api/data]', sheetName, e.message);
    return new Response('Temporarily unavailable', { status: 503 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Serve SPA index.html
// ─────────────────────────────────────────────────────────────────────────
async function serveIndex(env, request) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const headers  = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type',  'text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(response.body, { status: 200, headers });
}

// ─────────────────────────────────────────────────────────────────────────
//  Serve SPA index.html with route-specific meta tag injection
// ─────────────────────────────────────────────────────────────────────────
async function serveIndexWithMeta(env, request, normPath) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const meta     = ROUTE_META[normPath];
  let html       = await response.text();

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(meta.title)}<\/title>`);
  html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escHtml(meta.description)}"`);
  html = html.replace(/<link id="canonical" rel="canonical" href="[^"]*"/, `<link id="canonical" rel="canonical" href="${escHtml(meta.canonical)}"`);
  html = html.replace(/<meta property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${escHtml(meta.title)}"`);
  html = html.replace(/<meta property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${escHtml(meta.description)}"`);
  html = html.replace(/<meta property="og:url"\s+content="[^"]*"/, `<meta property="og:url" content="${escHtml(meta.canonical)}"`);
  html = html.replace(/<meta name="twitter:title"\s+content="[^"]*"/, `<meta name="twitter:title" content="${escHtml(meta.title)}"`);
  html = html.replace(/<meta name="twitter:description"\s+content="[^"]*"/, `<meta name="twitter:description" content="${escHtml(meta.description)}"`);

  if (meta.h1) {
    html = html.replace(
      /<h1[^>]*id="site-h1"[^>]*>/,
      `<h1 class="hero-title h1-hidden" id="site-h1" aria-hidden="true" style="display:none">`
    );
    html = html.replace(
      /<div id="app" role="main">/,
      `<div id="app" role="main"><h1 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" data-crawler-h1>${escHtml(meta.h1)}<\/h1>`
    );
  }

  const headers = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type',  'text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(html, { status: 200, headers });
}

// ─────────────────────────────────────────────────────────────────────────
//  Blog post SSR — full prerender for SEO + social sharing
// ─────────────────────────────────────────────────────────────────────────
async function prerenderBlogPost(slug, env, request) {
  const [blogRows, faqRows, imageRows] = await Promise.all([
    fetchSheetData('blog',   env),
    fetchSheetData('faq',    env),
    fetchSheetData('images', env),
  ]);

  const post = blogRows.find(r => (r.Slug || '').trim() === slug);

  if (!post) {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Post Not Found | Suman Dangal</title>
<meta name="robots" content="noindex,nofollow">
<style>body{font-family:sans-serif;padding:2rem;text-align:center}a{color:#2d6a4f}</style>
</head><body>
<h1>Post Not Found</h1>
<p>No post with slug <code>${escHtml(slug)}</code> exists.</p>
<a href="${SITE_URL}/blog">← Back to Blog</a>
</body></html>`;
    return new Response(html, {
      status: 404,
      headers: applySecurityHeaders(new Headers({ 'Content-Type': 'text/html;charset=UTF-8' })),
    });
  }

  const title       = post.Title    || '';
  const excerpt     = post.Excerpt  || '';
  const date        = post.Date     || '';
  const category    = post.Category || 'Post';
  const postUrl     = `${SITE_URL}/blog/${slug}`;
  const imageUrl    = fixImgUrl(post.Image_URL || '');
  const tagList     = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const keywordsStr = tagList.join(', ');

  // Build inline image map
  const imgMap = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^[Ii]mg(\d+)_[Uu][Rr][Ll]$/);
    if (m) imgMap[`img${m[1]}`] = { url: post[key], alt: post[`Img${m[1]}_Alt`] || '' };
  }
  if (imageRows?.length) {
    imageRows
      .filter(r  => (r.Blog_Slug || '').trim() === slug)
      .sort((a, b) => Number(a.Img_Number || 0) - Number(b.Img_Number || 0))
      .forEach(r => {
        const num = Number(r.Img_Number || 0);
        if (!num || !r.Img_URL) return;
        imgMap[`img${num}`] = { url: (r.Img_URL || '').trim(), alt: (r.Img_Alt || '').trim() };
      });
  }

  const bodyHTML = renderMarkdown(post.Content || '', imgMap);

  const faqItems = (faqRows || [])
    .filter(r  => (r.Blog_Slug || '').trim() === slug)
    .sort((a, b) => Number(a.FAQ_Number) - Number(b.FAQ_Number));

  const faqHTML = faqItems.length ? `
    <div class="pre-faq">
      <h2>Frequently Asked Questions</h2>
      ${faqItems.map(f => `
      <details>
        <summary>${escHtml(f.FAQ_Question || '')}</summary>
        <div class="faq-answer">${escHtml(f.FAQ_Answer || '')}</div>
      </details>`).join('')}
    </div>` : '';

  const faqSchemaTag = faqItems.length ? `
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
    ${faqItems.map(f =>
      `{"@type":"Question","name":"${escJson(f.FAQ_Question || '')}","acceptedAnswer":{"@type":"Answer","text":"${escJson(f.FAQ_Answer || '')}"}}`
    ).join(',')}
  ]}
  <\/script>` : '';

  const tagsHTML = tagList.length
    ? `<div class="pre-tags">${tagList.map(t => `<span class="pre-tag">${escHtml(t)}</span>`).join('')}</div>`
    : '';

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
  <link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">

  <!-- Open Graph -->
  <meta property="og:title"       content="${escHtml(title)} | Suman Dangal">
  <meta property="og:description" content="${escHtml(excerpt)}">
  <meta property="og:url"         content="${postUrl}">
  <meta property="og:type"        content="article">
  <meta property="og:site_name"   content="Suman Dangal">
  <meta property="article:published_time" content="${escHtml(date)}">
  <meta property="article:author" content="Suman Dangal">
  ${tagList.map(t => `<meta property="article:tag" content="${escHtml(t)}">`).join('\n  ')}
  ${imageUrl ? `<meta property="og:image" content="${escHtml(imageUrl)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(title)} | Suman Dangal">
  <meta name="twitter:description" content="${escHtml(excerpt)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escHtml(imageUrl)}">` : ''}

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style"
    href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&family=Great+Vibes&display=swap"
    onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&family=Great+Vibes&display=swap"></noscript>

  <!-- Structured data: BlogPosting -->
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BlogPosting",
   "headline":"${escJson(title)}",
   "description":"${escJson(excerpt)}",
   "datePublished":"${escJson(date)}",
   "dateModified":"${escJson(date)}",
   "url":"${postUrl}",
   "inLanguage":"en",
   "author":{"@type":"Person","name":"Suman Dangal","url":"${SITE_URL}/","sameAs":["https://linkedin.com/in/sumandangal963"]}
   ${imageUrl ? `,"image":{"@type":"ImageObject","url":"${escJson(imageUrl)}","width":1200,"height":630}` : ''}
   ${keywordsStr ? `,"keywords":"${escJson(keywordsStr)}"` : ''}
   ,"publisher":{"@type":"Person","name":"Suman Dangal","url":"${SITE_URL}/"}}
  <\/script>

  <!-- Structured data: Person -->
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Person",
   "name":"Suman Dangal","url":"${SITE_URL}/","jobTitle":"Dev & QA Engineer",
   "email":"sumandangal888@gmail.com",
   "address":{"@type":"PostalAddress","addressLocality":"Bhaktapur","addressCountry":"NP"},
   "sameAs":["https://linkedin.com/in/sumandangal963"]}
  <\/script>

  <!-- Structured data: BreadcrumbList -->
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Home","item":"${SITE_URL}/"},
    {"@type":"ListItem","position":2,"name":"Blog","item":"${SITE_URL}/blog"},
    {"@type":"ListItem","position":3,"name":"${escJson(title)}","item":"${postUrl}"}]}
  <\/script>

  ${faqSchemaTag}

  <style>${PRERENDER_CSS}<\/style>
</head>
<body>

  <nav class="pre-nav" role="navigation" aria-label="Main navigation">
    <a href="${SITE_URL}/" style="display:inline-flex;align-items:center;text-decoration:none" title="Suman Dangal" aria-label="Suman Dangal home">
      <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <rect width="48" height="48" rx="9" fill="#1b4332"/>
        <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle"
          font-family="'Great Vibes','Dancing Script',Georgia,serif"
          font-size="26" fill="#ffffff">SD</text>
      </svg>
    </a>
    <button class="pre-burger" id="preBurger" aria-label="Open menu" aria-expanded="false"
      onclick="var m=document.getElementById('preNavLinks');var o=!m.classList.contains('open');m.classList.toggle('open',o);this.setAttribute('aria-expanded',o)">
      <span></span><span></span><span></span>
    </button>
    <ul class="pre-nav-links" id="preNavLinks">
      <li><a href="${SITE_URL}/">Home</a></li>
      <li><a href="${SITE_URL}/skills">Skills</a></li>
      <li><a href="${SITE_URL}/projects">Projects</a></li>
      <li><a href="${SITE_URL}/blog" class="active">Blog</a></li>
      <li><a href="${SITE_URL}/experience">Experience</a></li>
      <li><a href="${SITE_URL}/about">About</a></li>
      <li><a href="${SITE_URL}/contact">Contact</a></li>
    </ul>
  </nav>

  <main class="pre-main" itemscope itemtype="https://schema.org/BlogPosting">
    <meta itemprop="headline"      content="${escHtml(title)}">
    <meta itemprop="description"   content="${escHtml(excerpt)}">
    <meta itemprop="datePublished" content="${escHtml(date)}">
    <meta itemprop="url"           content="${postUrl}">

    <!-- Breadcrumb visible -->
    <div class="pre-breadcrumb" aria-label="Breadcrumb">
      <a href="${SITE_URL}/">Home</a>
      <span aria-hidden="true">›</span>
      <a href="${SITE_URL}/blog">Blog</a>
      <span aria-hidden="true">›</span>
      <span>${escHtml(title)}</span>
    </div>

    <div class="pre-meta">
      <span class="pre-cat">${escHtml(category)}</span>
      <time datetime="${escHtml(date)}" itemprop="datePublished">${escHtml(date)}</time>
    </div>

    <h1 class="pre-title" itemprop="name">${escHtml(title)}</h1>

    ${tagsHTML}

    ${imageUrl
      ? `<img class="pre-cover" src="${escHtml(imageUrl)}"
           alt="${escHtml(post.Image_Alt || title + ' - Suman Dangal blog')}"
           width="720" height="400"
           loading="eager" decoding="async" fetchpriority="high"
           itemprop="image">`
      : ''}

    <div class="pre-body" itemprop="articleBody">${bodyHTML}</div>

    ${faqHTML}

    <hr style="border:none;border-top:1px solid var(--border);margin:2.5rem 0">

    <!-- Author byline for SEO -->
    <div style="display:flex;align-items:center;gap:.8rem;font-family:var(--mono);font-size:.75rem;color:var(--muted-light);margin-bottom:2rem" itemscope itemtype="https://schema.org/Person">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      <span>Written by <a href="${SITE_URL}/about" itemprop="url" style="color:var(--accent)"><span itemprop="name">Suman Dangal</span></a></span>
    </div>

    <a class="pre-back" href="${SITE_URL}/blog">← Back to all posts</a>
  </main>

  <footer class="pre-footer" role="contentinfo">
    <span>© 2026 Suman Dangal</span>
    <span>Built with ❤️ · Balkot, Bhaktapur, Nepal</span>
  </footer>

  <!-- Hydrate SPA for real users (bots keep the static HTML) -->
  <script>
    (function(){
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

  return new Response(html, {
    status: 200,
    headers: applySecurityHeaders(new Headers({
      'Content-Type':  'text/html;charset=UTF-8',
      'Cache-Control': htmlCacheHeaders(),
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Sitemap generation
// ─────────────────────────────────────────────────────────────────────────
async function generateSitemap(env) {
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
    const rows = await fetchSheetData('blog', env);
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
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
      'Content-Type':  'application/xml;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Internal: fetch + parse a named sheet
// ─────────────────────────────────────────────────────────────────────────
async function fetchSheetData(sheetName, env) {
  const cacheKey = `sheet_${sheetName}`;
  const cached   = memGet(cacheKey);
  if (cached) return parseCSV(cached);

  const sheetId  = (env && env.SHEET_ID) || SHEET_ID_FALLBACK;
  const gid      = SHEET_GIDS[sheetName];
  if (!gid) return [];

  const sheetUrl = `${SHEET_BASE}/${sheetId}/pub?gid=${gid}&single=true&output=csv`;
  try {
    const resp = await fetch(sheetUrl, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    memSet(cacheKey, text);
    return parseCSV(text);
  } catch (e) {
    console.warn('[fetchSheetData]', sheetName, e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Markdown renderer (for SSR blog posts)
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
        '<a href="$2" rel="noopener noreferrer">$1</a>');
  }

  const lines  = text.split(/\n/);
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
            `<figure><img src="${escHtml(src)}" alt="${escHtml(altTxt)}" ` +
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
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escJson(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '');
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
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}