/**
 * worker/ssr/meta.js — Suman Dangal Cloudflare Worker
 *
 * Responsibilities:
 *   - PRERENDER_CSS   : inline styles for SSR-rendered pages (bots see styled HTML)
 *   - ROUTE_META      : per-route title / description / canonical / h1 for known SPA routes
 *   - serveIndexWithMeta(env, request, normPath) : serve index.html with injected meta tags
 *   - serveIndex(env, request)                  : serve bare index.html (SPA shell)
 *   - generateSitemap(env, fetchSheetData)      : build sitemap.xml including blog + chord slugs
 *   - htmlCacheHeaders()                        : shared Cache-Control string for HTML responses
 *
 * Imports: worker/utils.js (escHtml, applySecurityHeaders)
 * Imported by: worker/index.js, worker/ssr/blog.js, worker/ssr/chords.js
 */

import { escHtml, applySecurityHeaders } from '../utils.js';

// ─────────────────────────────────────────────────────────────────────────
//  Site constants
// ─────────────────────────────────────────────────────────────────────────

export const SITE_URL = 'https://suman-dangal.com.np';

// ─────────────────────────────────────────────────────────────────────────
//  Cache-Control for HTML responses
// ─────────────────────────────────────────────────────────────────────────

export function htmlCacheHeaders() {
  return 'public, max-age=3600, stale-while-revalidate=86400';
}

// ─────────────────────────────────────────────────────────────────────────
//  Per-route SEO metadata
//  Used by serveIndexWithMeta() and worker/index.js route dispatch.
// ─────────────────────────────────────────────────────────────────────────

export const ROUTE_META = {
  '/': {
    title:       'Suman Dangal — Dev & QA Engineer',
    description: 'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.',
    canonical:   `${SITE_URL}/`,
    h1:          null,   // h1 lives in the hero — not injected as crawler-only
  },
  '/skills': {
    title:       'Skills & Stack | Suman Dangal',
    description: 'Python, Django, PHP, Java, Android Studio, manual QA testing — skills of Suman Dangal.',
    canonical:   `${SITE_URL}/skills`,
    h1:          'Skills & Stack',
  },
  '/projects': {
    title:       'Projects | Suman Dangal',
    description: 'Django e-commerce, PHP library system, Android Bluetooth app — projects by Suman Dangal.',
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
  '/chords': {
    title:       'Chord Sheets | Suman Dangal',
    description: 'Guitar chord sheets and tabs — Nepali, pop, folk, devotional songs by Suman Dangal.',
    canonical:   `${SITE_URL}/chords`,
    h1:          'Chord Sheets',
  },
};

// ─────────────────────────────────────────────────────────────────────────
//  PRERENDER_CSS
//  Mirrors the site design system exactly so SSR pages look correct before
//  the SPA hydrates. Bots and social crawlers never run JS — they see this.
//  Keep in sync with css/base.css tokens.
// ─────────────────────────────────────────────────────────────────────────

export const PRERENDER_CSS = `
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
/* Nav */
.pre-nav{
  position:fixed;top:0;left:0;right:0;height:var(--nav-h);z-index:1000;
  display:flex;align-items:center;justify-content:space-between;padding:0 4rem;
  background:rgba(255,255,255,.92);
  backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);
  border-bottom:1px solid var(--border);box-shadow:var(--shadow-sm);
}
.pre-nav-brand{font-family:var(--mono);font-size:.84rem;color:var(--accent);letter-spacing:.06em;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:.6rem}
.pre-nav-links{display:flex;gap:2.4rem;list-style:none}
.pre-nav-links a{font-family:var(--mono);font-size:.75rem;color:var(--muted);text-decoration:none;letter-spacing:.09em;text-transform:uppercase}
.pre-nav-links a.active{color:var(--accent);font-weight:500}
.pre-burger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:4px;min-width:44px;min-height:44px;align-items:center;justify-content:center}
.pre-burger span{display:block;width:21px;height:1.5px;background:var(--text);border-radius:1px}
/* Main content area */
.pre-main{max-width:720px;margin:0 auto;padding:5rem 4rem}
/* Breadcrumb */
.pre-breadcrumb{font-family:var(--mono);font-size:.7rem;color:var(--muted-light);letter-spacing:.06em;margin-bottom:1.8rem;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
.pre-breadcrumb a{color:var(--accent);text-decoration:none}
/* Meta line (category + date) */
.pre-meta{display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;font-family:var(--mono);font-size:.7rem;color:var(--muted-light);margin-bottom:1.4rem;letter-spacing:.06em}
.pre-cat{color:var(--accent);background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);padding:.14rem .5rem;border-radius:1rem;font-size:.65rem;font-weight:500}
/* Title */
.pre-title{font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.1;margin-bottom:1.8rem;color:var(--accent2)}
/* Tags */
.pre-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.6rem}
.pre-tag{font-family:var(--mono);font-size:.68rem;padding:.22rem .65rem;border-radius:.25rem;background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);color:var(--accent)}
/* Cover image */
.pre-cover{width:100%;max-height:420px;object-fit:cover;border-radius:.7rem;border:1.5px solid var(--border);margin-bottom:2.2rem;display:block;aspect-ratio:720/420}
/* Article body */
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
/* FAQ */
.pre-faq{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border)}
.pre-faq h2{font-family:var(--serif);font-size:1.55rem;margin-bottom:1.4rem;color:var(--accent2)}
.pre-faq details{border:1.5px solid var(--border);border-radius:.6rem;margin-bottom:.75rem;overflow:hidden;background:var(--card)}
.pre-faq details[open]{border-color:rgba(45,106,79,.3)}
.pre-faq summary{font-family:var(--sans);font-weight:500;font-size:.92rem;padding:1rem 1.2rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;color:var(--text);user-select:none}
.pre-faq summary::-webkit-details-marker{display:none}
.pre-faq summary::after{content:'+';font-family:var(--mono);font-size:1.1rem;color:var(--accent);flex-shrink:0;margin-left:.8rem}
.pre-faq details[open] summary::after{transform:rotate(45deg)}
.pre-faq .faq-answer{padding:.75rem 1.2rem 1rem;font-size:.88rem;color:var(--muted);line-height:1.75;border-top:1px solid var(--border)}
/* Chord tab (used by chords SSR) */
.pre-chord-header{margin-bottom:2rem}
.pre-chord-meta{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;font-family:var(--mono);font-size:.72rem;color:var(--muted-light)}
.pre-chord-badge{background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);color:var(--accent);padding:.18rem .55rem;border-radius:1rem;font-size:.68rem;font-weight:500}
.pre-tab{font-family:var(--mono);font-size:.84rem;line-height:1.9;white-space:pre;overflow-x:auto;background:var(--surface);border:1.5px solid var(--border);border-radius:.7rem;padding:1.8rem;margin-top:1.6rem;color:var(--text)}
.pre-tab .chord-name{color:var(--accent);font-weight:500}
/* Author byline */
.pre-author{display:flex;align-items:center;gap:.8rem;font-family:var(--mono);font-size:.75rem;color:var(--muted-light);margin:2rem 0;padding:1rem 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.pre-author a{color:var(--accent);text-decoration:none}
/* Footer */
.pre-footer{border-top:1px solid var(--border);padding:1.8rem 4rem;display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:.69rem;color:var(--muted);letter-spacing:.04em;background:var(--surface);margin-top:4rem}
/* Focus / motion */
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
/* Responsive */
@media(max-width:768px){
  .pre-nav{padding:0 1.5rem}
  .pre-nav-links{
    display:none;flex-direction:column;gap:0;
    position:fixed;top:var(--nav-h);left:0;right:0;
    background:rgba(255,255,255,.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    border-bottom:1px solid var(--border);padding:1rem 1.5rem;z-index:999;
  }
  .pre-nav-links.open{display:flex}
  .pre-nav-links li{border-bottom:1px solid var(--border)}
  .pre-nav-links li:last-child{border-bottom:none}
  .pre-nav-links a{display:flex;padding:.85rem 0;font-size:.82rem;min-height:44px;align-items:center}
  .pre-burger{display:flex}
  .pre-main{padding:3.5rem 1.5rem}
  .pre-footer{flex-direction:column;gap:.45rem;text-align:center;padding:1.5rem}
  .pre-tab{font-size:.75rem;padding:1.2rem}
}
@media(max-width:480px){.pre-main{padding:2.5rem 1.2rem}}
`;

// ─────────────────────────────────────────────────────────────────────────
//  Shared SSR nav HTML
//  Inlined into every SSR page so bots get a styled, functional nav.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the nav HTML for an SSR-prerendered page.
 * @param {string} activePath  e.g. '/blog', '/chords'
 * @returns {string}
 */
export function preNavHTML(activePath) {
  const links = [
    ['/', 'Home'],
    ['/skills', 'Skills'],
    ['/projects', 'Projects'],
    ['/blog', 'Blog'],
    ['/experience', 'Experience'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
  ];

  const listItems = links
    .map(([href, label]) => {
      const isActive = activePath === href ||
        (href !== '/' && activePath.startsWith(href));
      return `<li><a href="${SITE_URL}${href}"${isActive ? ' class="active"' : ''}>${label}</a></li>`;
    })
    .join('');

  return `
  <nav class="pre-nav" role="navigation" aria-label="Main navigation">
    <a class="pre-nav-brand" href="${SITE_URL}/" title="Suman Dangal" aria-label="Suman Dangal home">
      <svg width="40" height="40" viewBox="0 0 48 48" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
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
      ${listItems}
    </ul>
  </nav>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  Shared SSR footer HTML
// ─────────────────────────────────────────────────────────────────────────

export const preFooterHTML = `
  <footer class="pre-footer" role="contentinfo">
    <span>© 2026 Suman Dangal</span>
    <span>Built with ❤️ · Balkot, Bhaktapur, Nepal</span>
  </footer>`;

// ─────────────────────────────────────────────────────────────────────────
//  Hydration script
//  Injected at the bottom of every SSR page. Real users (non-bots) get
//  redirected to the SPA shell after a quick user-agent check.
//  Bots keep the static HTML — no JS execution needed.
// ─────────────────────────────────────────────────────────────────────────

export const hydrationScript = `
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
  <\/script>`;

// ─────────────────────────────────────────────────────────────────────────
//  Shared SSR <head> builder
//  Returns the full <head> block for any SSR-prerendered page.
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}   opts.title         — <title> text (without site suffix)
 * @param {string}   opts.description
 * @param {string}   opts.canonical     — full canonical URL
 * @param {string}   [opts.ogImage]     — full OG image URL
 * @param {string}   [opts.ogType]      — 'article' | 'website' | 'music.song' etc.
 * @param {string}   [opts.robots]      — meta robots content, default 'index, follow'
 * @param {string[]} [opts.extraMeta]   — additional raw <meta> strings
 * @param {string[]} [opts.schemas]     — JSON-LD <script> strings (already serialised)
 * @returns {string}
 */
export function buildSSRHead({
  title,
  description,
  canonical,
  ogImage  = `${SITE_URL}/og.png`,
  ogType   = 'website',
  robots   = 'index, follow',
  extraMeta = [],
  schemas   = [],
}) {
  const fullTitle = `${title} | Suman Dangal`;
  const schemaBlocks = schemas
    .map(s => `  <script type="application/ld+json">\n  ${s}\n  <\/script>`)
    .join('\n');
  const extraMetaBlock = extraMeta.join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(fullTitle)}</title>
  <meta name="description" content="${escHtml(description)}">
  <meta name="robots" content="${escHtml(robots)}">
  <link rel="canonical" href="${escHtml(canonical)}">
  <link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">

  <!-- Open Graph -->
  <meta property="og:title"       content="${escHtml(fullTitle)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:url"         content="${escHtml(canonical)}">
  <meta property="og:type"        content="${escHtml(ogType)}">
  <meta property="og:site_name"   content="Suman Dangal">
  <meta property="og:image"       content="${escHtml(ogImage)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(fullTitle)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image"       content="${escHtml(ogImage)}">

  ${extraMetaBlock}

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style"
    href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap"
    onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap">
  </noscript>

  <!-- Structured data -->
${schemaBlocks}

  <style>${PRERENDER_CSS}<\/style>
</head>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  serveIndex — bare SPA shell for unknown/catch-all routes
// ─────────────────────────────────────────────────────────────────────────

/**
 * Serve the raw index.html SPA shell with security headers applied.
 * @param {object} env        Cloudflare Worker env binding
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function serveIndex(env, request) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const headers  = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type',  'text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(response.body, { status: 200, headers });
}

// ─────────────────────────────────────────────────────────────────────────
//  serveIndexWithMeta — SPA shell with route-specific meta tag injection
//  Used for known SPA routes (/skills, /blog, /chords, etc.) so that
//  social crawlers and link-preview bots see correct OG tags even though
//  the page itself is a JS-rendered SPA.
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {object} env
 * @param {Request} request
 * @param {string}  normPath  — normalised pathname, key into ROUTE_META
 * @returns {Promise<Response>}
 */
export async function serveIndexWithMeta(env, request, normPath) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const meta     = ROUTE_META[normPath];
  let html       = await response.text();

  // ── Inject per-route meta via regex replace ──────────────────────────
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escHtml(meta.title)}<\/title>`
  );
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escHtml(meta.description)}"`
  );
  html = html.replace(
    /<link id="canonical" rel="canonical" href="[^"]*"/,
    `<link id="canonical" rel="canonical" href="${escHtml(meta.canonical)}"`
  );
  html = html.replace(
    /<meta property="og:title"\s+content="[^"]*"/,
    `<meta property="og:title" content="${escHtml(meta.title)}"`
  );
  html = html.replace(
    /<meta property="og:description"\s+content="[^"]*"/,
    `<meta property="og:description" content="${escHtml(meta.description)}"`
  );
  html = html.replace(
    /<meta property="og:url"\s+content="[^"]*"/,
    `<meta property="og:url" content="${escHtml(meta.canonical)}"`
  );
  html = html.replace(
    /<meta name="twitter:title"\s+content="[^"]*"/,
    `<meta name="twitter:title" content="${escHtml(meta.title)}"`
  );
  html = html.replace(
    /<meta name="twitter:description"\s+content="[^"]*"/,
    `<meta name="twitter:description" content="${escHtml(meta.description)}"`
  );

  // ── Inject crawler-only h1 for non-home routes ───────────────────────
  // The hero h1 is only on home. Other routes get a visually hidden h1
  // injected at the top of #app so crawlers find the page heading.
  if (meta.h1) {
    html = html.replace(
      /<div id="app" role="main">/,
      `<div id="app" role="main">` +
      `<h1 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" data-crawler-h1>` +
      `${escHtml(meta.h1)}<\/h1>`
    );
  }

  const headers = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type',  'text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(html, { status: 200, headers });
}

// ─────────────────────────────────────────────────────────────────────────
//  generateSitemap
//  Builds sitemap.xml with static routes + all blog slugs + all chord slugs.
//  fetchSheetData is passed in by worker/index.js to avoid circular imports.
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {object} env
 * @param {function(string, object): Promise<object[]>} fetchSheetData
 * @returns {Promise<Response>}
 */
export async function generateSitemap(env, fetchSheetData) {
  const staticPages = [
    { loc: '/',           priority: '1.0', changefreq: 'monthly' },
    { loc: '/skills',     priority: '0.7', changefreq: 'monthly' },
    { loc: '/projects',   priority: '0.8', changefreq: 'monthly' },
    { loc: '/blog',       priority: '0.9', changefreq: 'weekly'  },
    { loc: '/experience', priority: '0.7', changefreq: 'monthly' },
    { loc: '/about',      priority: '0.6', changefreq: 'monthly' },
    { loc: '/contact',    priority: '0.5', changefreq: 'yearly'  },
    { loc: '/chords',     priority: '0.8', changefreq: 'weekly'  },
  ];

  // Fetch blog and chord slugs in parallel — silent fail on either
  const [blogRows, chordRows] = await Promise.all([
    fetchSheetData('blog',   env).catch(() => []),
    fetchSheetData('chords', env).catch(() => []),
  ]);

  const blogUrls = (blogRows || [])
    .filter(r => r.Slug?.trim())
    .map(r => ({
      loc:        `/blog/${r.Slug.trim()}`,
      priority:   '0.8',
      changefreq: 'monthly',
      lastmod:    _isoDate(r.Date || ''),
    }));

  const chordUrls = (chordRows || [])
    .filter(r => r.Slug?.trim())
    .map(r => ({
      loc:        `/chords/${r.Slug.trim()}`,
      priority:   '0.7',
      changefreq: 'monthly',
      lastmod:    _isoDate(r.Date_Added || ''),
    }));

  const all = [...staticPages, ...blogUrls, ...chordUrls];

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
    status:  200,
    headers: {
      'Content-Type':  'application/xml;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────

function _isoDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}