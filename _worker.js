const BLOG_SHEET_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1132024800&single=true&output=csv';
const FAQ_SHEET_URL    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=303688554&single=true&output=csv';
const IMAGES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQuOox7oJ5frLVTIRzed1hVjUgfa6E0w7RKmAX2CXKmC3RdcPQCgb1jBtdLec8vugpRiYT3_zqH6Qc/pub?gid=1267436347&single=true&output=csv';
const SITE_URL         = 'https://suman-dangal.com.np';

let blogCache = null, blogCacheTime = 0;
let faqCache  = null, faqCacheTime  = 0;
let imgCache  = null, imgCacheTime  = 0;
const CACHE_MS = 10 * 60 * 1000;

const ROUTE_META = {
  '/':           { title:'Suman Dangal — Dev & QA Engineer',  description:'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.',                                        canonical:`${SITE_URL}/`,           h1:null },
  '/skills':     { title:'Skills & Stack | Suman Dangal',      description:'Python, Django, PHP, Java, Android Studio, manual QA testing and more — skills of Suman Dangal.',                   canonical:`${SITE_URL}/skills`,     h1:'Skills & Stack' },
  '/projects':   { title:'Projects | Suman Dangal',            description:'Django e-commerce, PHP library system, Android Bluetooth app and more — projects by Suman Dangal.',                 canonical:`${SITE_URL}/projects`,   h1:'Projects' },
  '/blog':       { title:'Blog | Suman Dangal',                description:'Dev notes, QA tips, and tech writing by Suman Dangal — final-year BCA student in Nepal.',                           canonical:`${SITE_URL}/blog`,       h1:'Blog' },
  '/experience': { title:'Experience | Suman Dangal',          description:'SEO Intern at Sathi Edtech and QA/testing projects — work experience of Suman Dangal.',                             canonical:`${SITE_URL}/experience`, h1:'Experience' },
  '/about':      { title:'About Suman Dangal',                 description:'BCA student at Tribhuvan University, Bhaktapur, Nepal. Full-stack developer and QA tester.',                         canonical:`${SITE_URL}/about`,      h1:'About Suman Dangal' },
  '/contact':    { title:'Contact | Suman Dangal',             description:'Get in touch with Suman Dangal for Dev or QA internship opportunities in Nepal.',                                    canonical:`${SITE_URL}/contact`,    h1:'Contact' },
};

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
    "connect-src 'self' https://docs.google.com; " +
    "frame-ancestors 'none';",
};

// ── PRERENDER CSS — exactly mirrors index.html SPA styles ──
// Same variables, same nav, same article layout, same breakpoints.
// When the SPA loads over this via document.write, zero visual flash.
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
/* Nav — identical to SPA */
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
/* Article container — matches SPA #view-article .container */
.pre-main{max-width:720px;margin:0 auto;padding:5rem 4rem}
/* Back link — matches .article-back */
.pre-back{display:inline-flex;align-items:center;gap:.5rem;font-family:var(--mono);font-size:.72rem;color:var(--muted);text-decoration:none;margin-bottom:2.4rem;letter-spacing:.05em}
.pre-back:hover{color:var(--accent)}
/* Breadcrumb */
.pre-breadcrumb{font-family:var(--mono);font-size:.7rem;color:var(--muted-light);letter-spacing:.06em;margin-bottom:1.8rem;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
.pre-breadcrumb a{color:var(--accent);text-decoration:none}
/* Meta — matches .article-meta */
.pre-meta{display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;font-family:var(--mono);font-size:.7rem;color:var(--muted-light);margin-bottom:1.4rem;letter-spacing:.06em}
.pre-cat{color:var(--accent);background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);padding:.14rem .5rem;border-radius:1rem;font-size:.65rem;font-weight:500}
/* Title — matches h2.article-title */
.pre-title{font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.1;margin-bottom:1.8rem;color:var(--accent2)}
/* Tags — matches .article-tags */
.pre-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.6rem}
.pre-tag{font-family:var(--mono);font-size:.68rem;padding:.22rem .65rem;border-radius:.25rem;background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);color:var(--accent)}
/* Cover — matches .article-cover */
.pre-cover{width:100%;max-height:420px;object-fit:cover;border-radius:.7rem;border:1.5px solid var(--border);margin-bottom:2.2rem;display:block;aspect-ratio:720/420}
/* Body — matches .article-body */
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
/* Inline images — matches .blog-figure */
.pre-body figure{margin:2rem 0}
.pre-body figure img{display:block;width:100%;height:auto;border-radius:.6rem;border:1.5px solid var(--border);aspect-ratio:680/383;object-fit:cover}
.pre-body figcaption{font-family:var(--mono);font-size:.7rem;color:var(--muted-light);text-align:center;margin-top:.55rem;letter-spacing:.04em;font-style:italic}
/* FAQ — matches .faq-section */
.pre-faq{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border)}
.pre-faq h2{font-family:var(--serif);font-size:1.55rem;margin-bottom:1.4rem;color:var(--accent2)}
.pre-faq details{border:1.5px solid var(--border);border-radius:.6rem;margin-bottom:.75rem;overflow:hidden;background:var(--card)}
.pre-faq details[open]{border-color:rgba(45,106,79,.3)}
.pre-faq summary{font-family:var(--sans);font-weight:500;font-size:.92rem;padding:1rem 1.2rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;color:var(--text);user-select:none}
.pre-faq summary::-webkit-details-marker{display:none}
.pre-faq summary::after{content:'+';font-family:var(--mono);font-size:1.1rem;color:var(--accent);transition:transform .25s;flex-shrink:0;margin-left:.8rem}
.pre-faq details[open] summary::after{transform:rotate(45deg)}
.pre-faq .faq-answer{padding:.75rem 1.2rem 1rem;font-size:.88rem;color:var(--muted);line-height:1.75;border-top:1px solid var(--border)}
/* Footer — matches SPA footer */
.pre-footer{border-top:1px solid var(--border);padding:1.8rem 4rem;display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:.69rem;color:var(--muted);letter-spacing:.04em;background:var(--surface);margin-top:4rem}
/* Reduced motion */
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
/* Focus */
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
/* Mobile — matches SPA breakpoints exactly */
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

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

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
          headers: { 'Content-Type':'text/csv;charset=UTF-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'public, max-age=600, stale-while-revalidate=3600' }
        });
      } catch (e) { return new Response('Fetch failed: '+e.message, { status:502 }); }
    }

    if (path === '/sitemap.xml') return await generateSitemap();

    if (path === '/llms.txt') {
      return new Response(
`# Suman Dangal — Dev & QA Engineer
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
`, { status:200, headers:{ 'Content-Type':'text/plain;charset=UTF-8', 'Cache-Control':'public, max-age=86400' } });
    }

    if (path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|txt|json|xml)$/i)) {
      try {
        const assetResp = await env.ASSETS.fetch(request);
        const headers = new Headers(assetResp.headers);
        if (path.match(/\.(woff2?|ttf|eot)$/i)) headers.set('Cache-Control','public, max-age=31536000, immutable');
        return new Response(assetResp.body, { status:assetResp.status, headers });
      } catch { return new Response('Not found', { status:404 }); }
    }

    const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) return await prerenderBlogPost(blogMatch[1], env, request);

    const normPath = path === '/' ? '/' : path.replace(/\/$/, '');
    if (ROUTE_META[normPath]) return await serveIndexWithMeta(env, request, normPath);

    return await serveIndex(env, request);
  }
};

function applySecurityHeaders(headers) {
  for (const [k,v] of Object.entries(SECURITY_HEADERS)) headers.set(k,v);
  return headers;
}

function htmlCacheHeaders() { return 'public, max-age=3600, stale-while-revalidate=86400'; }

async function serveIndex(env, request) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const headers  = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type','text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(response.body, { status:200, headers });
}

async function serveIndexWithMeta(env, request, normPath) {
  const indexUrl = new URL('/', new URL(request.url).origin);
  const response = await env.ASSETS.fetch(new Request(indexUrl, request));
  const meta = ROUTE_META[normPath];
  let html = await response.text();

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(meta.title)}<\/title>`);
  html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escHtml(meta.description)}"`);
  html = html.replace(/<link id="canonical" rel="canonical" href="[^"]*"/, `<link id="canonical" rel="canonical" href="${escHtml(meta.canonical)}"`);
  html = html.replace(/<meta property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${escHtml(meta.title)}"`);
  html = html.replace(/<meta property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${escHtml(meta.description)}"`);
  html = html.replace(/<meta property="og:url"\s+content="[^"]*"/, `<meta property="og:url" content="${escHtml(meta.canonical)}"`);
  html = html.replace(/<meta name="twitter:title"\s+content="[^"]*"/, `<meta name="twitter:title" content="${escHtml(meta.title)}"`);
  html = html.replace(/<meta name="twitter:description"\s+content="[^"]*"/, `<meta name="twitter:description" content="${escHtml(meta.description)}"`);

  if (meta.h1) {
    html = html.replace(/<h1[^>]*id="site-h1"[^>]*>/, `<h1 class="hero-title h1-hidden" id="site-h1" aria-hidden="true" style="display:none">`);
    html = html.replace(/<div id="app" role="main">/, `<div id="app" role="main"><h1 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" data-crawler-h1>${escHtml(meta.h1)}<\/h1>`);
  }

  const headers = applySecurityHeaders(new Headers(response.headers));
  headers.set('Content-Type','text/html;charset=UTF-8');
  headers.set('Cache-Control', htmlCacheHeaders());
  return new Response(html, { status:200, headers });
}

async function getBlogData() {
  const now = Date.now();
  if (blogCache && (now-blogCacheTime) < CACHE_MS) return blogCache;
  try { const text = await fetch(BLOG_SHEET_URL).then(r=>r.text()); blogCache=parseCSV(text); blogCacheTime=now; return blogCache; }
  catch (e) { console.warn('Worker: blog sheet fetch failed', e.message); return blogCache||[]; }
}

async function getFaqData() {
  const now = Date.now();
  if (faqCache && (now-faqCacheTime) < CACHE_MS) return faqCache;
  try { const text = await fetch(FAQ_SHEET_URL).then(r=>r.text()); faqCache=parseCSV(text); faqCacheTime=now; return faqCache; }
  catch (e) { console.warn('Worker: faq sheet fetch failed', e.message); return faqCache||[]; }
}

async function getImageData() {
  if (!IMAGES_SHEET_URL || IMAGES_SHEET_URL.includes('PASTE_YOUR')) return [];
  const now = Date.now();
  if (imgCache && (now-imgCacheTime) < CACHE_MS) return imgCache;
  try { const text = await fetch(IMAGES_SHEET_URL).then(r=>r.text()); imgCache=parseCSV(text); imgCacheTime=now; return imgCache; }
  catch (e) { console.warn('Worker: images sheet fetch failed', e.message); return imgCache||[]; }
}

async function prerenderBlogPost(slug, env, request) {
  const [blogRows, faqRows, imageRows] = await Promise.all([getBlogData(), getFaqData(), getImageData()]);
  const post = blogRows.find(r => (r.Slug||'').trim() === slug);

  if (!post) {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Post Not Found | Suman Dangal</title><meta name="robots" content="noindex,nofollow"></head><body><h1>Post not found</h1><a href="${SITE_URL}/blog">← Back to Blog</a></body></html>`;
    return new Response(html, { status:404, headers:applySecurityHeaders(new Headers({'Content-Type':'text/html;charset=UTF-8'})) });
  }

  const title       = post.Title    || '';
  const excerpt     = post.Excerpt  || '';
  const date        = post.Date     || '';
  const category    = post.Category || 'Post';
  const postUrl     = `${SITE_URL}/blog/${slug}`;
  const imageUrl    = fixImgUrl(post.Image_URL || '');
  const tagList     = (post.Tags||'').split(',').map(t=>t.trim()).filter(Boolean);
  const keywordsStr = tagList.join(', ');

  const imgMap = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^[Ii]mg(\d+)_[Uu][Rr][Ll]$/);
    if (m) imgMap[`img${m[1]}`] = { url:post[key], alt:post[`Img${m[1]}_Alt`]||'' };
  }
  if (imageRows?.length) {
    imageRows
      .filter(r => (r.Blog_Slug||'').trim() === slug)
      .sort((a,b) => Number(a.Img_Number||0)-Number(b.Img_Number||0))
      .forEach(r => {
        const num = Number(r.Img_Number||0);
        if (!num||!r.Img_URL) return;
        imgMap[`img${num}`] = { url:(r.Img_URL||'').trim(), alt:(r.Img_Alt||'').trim() };
      });
  }

  const bodyHTML = renderMarkdown(post.Content||'', imgMap);

  const faqItems = faqRows
    .filter(r => (r.Blog_Slug||'').trim() === slug)
    .sort((a,b) => Number(a.FAQ_Number)-Number(b.FAQ_Number));

  const faqHTML = faqItems.length ? `
    <div class="pre-faq">
      <h2>Frequently Asked Questions</h2>
      ${faqItems.map(f=>`
      <details>
        <summary>${escHtml(f.FAQ_Question||'')}</summary>
        <div class="faq-answer">${escHtml(f.FAQ_Answer||'')}</div>
      </details>`).join('')}
    </div>` : '';

  const faqSchemaTag = faqItems.length ? `
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
    ${faqItems.map(f=>`{"@type":"Question","name":"${escJson(f.FAQ_Question||'')}","acceptedAnswer":{"@type":"Answer","text":"${escJson(f.FAQ_Answer||'')}"}}`).join(',')}
  ]}
  <\/script>` : '';

  const tagsHTML = tagList.length
    ? `<div class="pre-tags">${tagList.map(t=>`<span class="pre-tag">${escHtml(t)}</span>`).join('')}</div>` : '';

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
  <meta property="og:site_name"   content="Suman Dangal">
  ${imageUrl ? `<meta property="og:image" content="${escHtml(imageUrl)}">` : ''}
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(title)} | Suman Dangal">
  <meta name="twitter:description" content="${escHtml(excerpt)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escHtml(imageUrl)}">` : ''}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style"
    href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap"
    onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap"></noscript>

  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BlogPosting",
   "headline":"${escJson(title)}","description":"${escJson(excerpt)}",
   "datePublished":"${escJson(date)}","url":"${postUrl}",
   "author":{"@type":"Person","name":"Suman Dangal","url":"${SITE_URL}/"}
   ${imageUrl ? `,"image":"${escJson(imageUrl)}"` : ''}
   ${keywordsStr ? `,"keywords":"${escJson(keywordsStr)}"` : ''}}
  <\/script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Person",
   "name":"Suman Dangal","url":"${SITE_URL}/","jobTitle":"Dev & QA Engineer",
   "address":{"@type":"PostalAddress","addressLocality":"Bhaktapur","addressCountry":"NP"},
   "sameAs":["https://linkedin.com/in/sumandangal963"]}
  <\/script>
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
    <a class="pre-nav-brand" href="${SITE_URL}/" title="Suman Dangal — Dev &amp; QA Engineer">&lt;SD/&gt;</a>
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

  <main class="pre-main">

    <a class="pre-back" href="${SITE_URL}/blog">← Back to Blog</a>

    <nav class="pre-breadcrumb" aria-label="Breadcrumb">
      <a href="${SITE_URL}/">Home</a><span>→</span>
      <a href="${SITE_URL}/blog">Blog</a><span>→</span>
      <span>${escHtml(title)}</span>
    </nav>

    <div class="pre-meta">
      <span class="pre-cat">${escHtml(category)}</span>
      <time datetime="${escHtml(date)}">${escHtml(date)}</time>
    </div>

    <h1 class="pre-title">${escHtml(title)}</h1>

    ${tagsHTML}

    ${imageUrl ? `<img class="pre-cover" src="${escHtml(imageUrl)}" alt="${escHtml(post.Image_Alt||title)}" width="720" height="400" loading="eager" decoding="async" fetchpriority="high">` : ''}

    <div class="pre-body">${bodyHTML}</div>

    ${faqHTML}

    <hr style="border:none;border-top:1px solid var(--border);margin:2.5rem 0">
    <a class="pre-back" href="${SITE_URL}/blog">← Back to all posts</a>

  </main>

  <footer class="pre-footer" role="contentinfo">
    <span>© 2026 Suman Dangal</span>
    <span>Built with ❤️ · Balkot, Bhaktapur, Nepal</span>
  </footer>

  <script>
    (function(){
      var ua=navigator.userAgent||'';
      var isBot=/google|bing|yandex|baidu|duckduck|slurp|facebook|twitter|linkedin|whatsapp|telegram|apple|pinterest|reddit|slack|discord|crawler|spider|bot|headless|prerender|python|curl|wget|java|ruby|go-http|node-fetch/i.test(ua);
      var looksReal=typeof window!=='undefined'&&typeof history!=='undefined'&&navigator.cookieEnabled;
      if(!isBot&&looksReal){
        fetch('/').then(function(r){return r.text();}).then(function(html){
          document.open();document.write(html);document.close();
        }).catch(function(){});
      }
    })();
  <\/script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: applySecurityHeaders(new Headers({ 'Content-Type':'text/html;charset=UTF-8', 'Cache-Control':htmlCacheHeaders() }))
  });
}

async function generateSitemap() {
  const staticPages = [
    { loc:'/',           priority:'1.0', changefreq:'monthly' },
    { loc:'/skills',     priority:'0.7', changefreq:'monthly' },
    { loc:'/projects',   priority:'0.8', changefreq:'monthly' },
    { loc:'/blog',       priority:'0.9', changefreq:'weekly'  },
    { loc:'/experience', priority:'0.7', changefreq:'monthly' },
    { loc:'/about',      priority:'0.6', changefreq:'monthly' },
    { loc:'/contact',    priority:'0.5', changefreq:'yearly'  },
  ];
  let blogUrls = [];
  try {
    const rows = await getBlogData();
    blogUrls = rows.filter(r=>r.Slug&&r.Slug.trim()).map(r=>({ loc:`/blog/${r.Slug.trim()}`, priority:'0.8', changefreq:'monthly', lastmod:formatDate(r.Date||'') }));
  } catch {}
  const all = [...staticPages, ...blogUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(p=>`  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    ${p.lastmod?`<lastmod>${p.lastmod}</lastmod>`:''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  return new Response(xml, { status:200, headers:{ 'Content-Type':'application/xml;charset=UTF-8', 'Cache-Control':'public, max-age=3600, stale-while-revalidate=86400' } });
}

function renderMarkdown(text, imgMap) {
  if (!text) return '';
  function inlineFmt(raw) {
    return escHtml(raw)
      .replace(/&#124;/g,'|')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g,'<em>$1</em>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" rel="noopener noreferrer">$1</a>');
  }
  const lines=text.split(/\n/); const out=[]; let inList=false,inOl=false;
  function closeList(){ if(inList){out.push('</ul>');inList=false;} if(inOl){out.push('</ol>');inOl=false;} }
  for (const raw of lines) {
    const l = raw.startsWith('|') ? raw.slice(1) : raw;
    if (l.trim()==='') { closeList(); out.push('<br>'); continue; }
    if (l.startsWith('## '))  { closeList(); out.push(`<h2>${inlineFmt(l.slice(3))}</h2>`); continue; }
    if (l.startsWith('### ')) { closeList(); out.push(`<h3>${inlineFmt(l.slice(4))}</h3>`); continue; }
    if (l.startsWith('- '))   { if(inOl){out.push('</ol>');inOl=false;} if(!inList){out.push('<ul>');inList=true;} out.push(`<li>${inlineFmt(l.slice(2))}</li>`); continue; }
    if (/^\d+\.\s/.test(l))  { if(inList){out.push('</ul>');inList=false;} if(!inOl){out.push('<ol>');inOl=true;} out.push(`<li>${inlineFmt(l.replace(/^\d+\.\s/,''))}</li>`); continue; }
    if (l.startsWith('> '))  { closeList(); out.push(`<blockquote><p>${inlineFmt(l.slice(2))}</p></blockquote>`); continue; }
    const imgMatch = l.trim().match(/^\[img(\d+)\]$/i);
    if (imgMatch && imgMap) {
      closeList();
      const entry = imgMap[`img${imgMatch[1]}`];
      if (entry) {
        const src    = fixImgUrl(typeof entry==='object' ? entry.url : entry);
        const altTxt = (typeof entry==='object'&&entry.alt) ? entry.alt : `image ${imgMatch[1]}`;
        if (src) out.push(`<figure><img src="${escHtml(src)}" alt="${escHtml(altTxt)}" width="680" height="383" loading="lazy" decoding="async"><figcaption>${escHtml(altTxt)}</figcaption></figure>`);
      }
      continue;
    }
    closeList();
    out.push(`<p>${inlineFmt(l)}</p>`);
  }
  closeList();
  return out.join('\n');
}

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJson(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,''); }
function fixImgUrl(url){
  if(!url) return '';
  url=url.trim();
  const m1=url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/); if(m1) return `https://lh3.googleusercontent.com/d/${m1[1]}`;
  const m2=url.match(/drive\.google\.com\/open\?id=([^&]+)/);  if(m2) return `https://lh3.googleusercontent.com/d/${m2[1]}`;
  const m3=url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);  if(m3) return `https://lh3.googleusercontent.com/d/${m3[1]}`;
  return url;
}
function parseCSV(raw){
  const rows=[]; let cur='',inQ=false,row=[];
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(c==='"'){if(inQ&&raw[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(c===','&&!inQ){row.push(cur);cur='';}
    else if((c==='\n'||(c==='\r'&&raw[i+1]==='\n'))&&!inQ){if(c==='\r')i++;row.push(cur);cur='';rows.push(row);row=[];}
    else cur+=c;
  }
  row.push(cur); if(row.some(v=>v)) rows.push(row);
  if(rows.length<2) return [];
  const headers=rows[0].map(h=>h.trim());
  return rows.slice(1).map(vals=>{const obj={};headers.forEach((h,i)=>{obj[h]=(vals[i]??'').trim();});return obj;}).filter(r=>Object.values(r).some(v=>v));
}
function formatDate(dateStr){
  try{const d=new Date(dateStr);if(isNaN(d.getTime()))return null;return d.toISOString().split('T')[0];}catch{return null;}
}