// js/shared/render.js
// ═══════════════════════════════════════════════════════════════════════════
//  Pure string templates shared by the browser views AND the worker (SSR).
//
//  Rules for this file:
//   - No DOM, no fetch, no globals: it must run in browsers and in Workers.
//   - Every value from the Sheet goes through esc() / safeUrl() / jsonLd().
//   - Server and client render the same markup from the same function, so
//     the server-rendered page and the SPA can never drift apart.
// ═══════════════════════════════════════════════════════════════════════════

export const SITE_URL       = 'https://suman-dangal.com.np';
export const SITE_NAME      = 'Suman Dangal';
export const DEFAULT_IMAGE  = `${SITE_URL}/android-chrome-512x512.png`;
export const POSTS_PER_PAGE = 6;
export const LINKEDIN_URL   = 'https://linkedin.com/in/sumandangal963';

// Per-route metadata. `title` is the full <title>; `heading` is the visible H1.
export const ROUTES = {
  '/':           { view: 'home',       css: ['/css/featured.css'],
                   title: 'Suman Dangal — Dev & QA Engineer',
                   description: 'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.' },
  '/skills':     { view: 'skills',     css: ['/css/skills.css'],   heading: 'Skills & Stack',
                   title: 'Skills & Stack | Suman Dangal',
                   description: 'Python, Django, PHP, Java, Android Studio, manual QA testing — skills of Suman Dangal.' },
  '/projects':   { view: 'projects',   css: ['/css/projects.css'], heading: 'Projects',
                   title: 'Projects | Suman Dangal',
                   description: 'Django e-commerce, PHP library system, Android Bluetooth app — projects by Suman Dangal.' },
  '/blog':       { view: 'blog',       css: ['/css/blog.css'],     heading: 'Blog',
                   title: 'Blog | Suman Dangal',
                   description: 'Dev notes, QA tips, and tech writing by Suman Dangal — final-year BCA student in Nepal.' },
  '/experience': { view: 'experience', css: ['/css/about.css'],    heading: 'Experience',
                   title: 'Experience | Suman Dangal',
                   description: 'SEO Intern at Sathi Edtech and QA/testing projects — work experience of Suman Dangal.' },
  '/about':      { view: 'about',      css: ['/css/about.css'],    heading: 'About',
                   title: 'About Suman Dangal',
                   description: 'BCA student at Tribhuvan University, Bhaktapur, Nepal. Full-stack developer and QA tester.' },
  '/contact':    { view: 'contact',    css: ['/css/about.css', '/css/blog.css'], heading: 'Contact',
                   title: 'Contact | Suman Dangal',
                   description: 'Get in touch with Suman Dangal for Dev or QA internship opportunities in Nepal.' },
  '/privacy':    { view: 'privacy',    css: [],                    heading: 'Privacy',
                   title: 'Privacy | Suman Dangal',
                   description: 'How suman-dangal.com.np uses analytics cookies and browser storage, and how to change your choice.' },
};
export const ARTICLE_CSS = ['/css/blog.css'];

// ─────────────────────────────────────────────────────────────────────────
//  Escaping and URL safety
// ─────────────────────────────────────────────────────────────────────────

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only http(s), mailto:, tel:, site-relative paths and #fragments. Else ''. */
export function safeUrl(u) {
  u = String(u ?? '').trim();
  return /^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(u) ? u : '';
}

/** JSON for <script type="application/ld+json">: cannot close the tag. */
export function jsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Google Drive share links → direct image URL; non-http(s) → ''. */
export function fixImgUrl(url) {
  if (!url) return '';
  url = String(url).trim();
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}`;
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}`;
  const m3 = url.match(/drive\.google\.com\/uc\?.*?id=([^&]+)/);
  if (m3) return `https://lh3.googleusercontent.com/d/${m3[1]}`;
  return /^https?:\/\//i.test(url) ? url : '';
}

// ─────────────────────────────────────────────────────────────────────────
//  Row helpers
// ─────────────────────────────────────────────────────────────────────────

export const splitList = (s, sep = ',') => String(s ?? '').split(sep).map(t => t.trim()).filter(Boolean);

export function dateValue(s) {
  const t = new Date(s || 0).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * 'YYYY-MM-DD' or null. Uses the calendar day as written ("April 18, 2026"
 * → 2026-04-18) in any time zone — toISOString() would shift dates back a
 * day in browsers east of UTC (Nepal is UTC+5:45).
 */
export function isoDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Optional "Status" (or "Published") column hides a row everywhere.
const HIDDEN_STATUS = /^(draft|unpublished|hidden|private|no|false|0)$/i;
export const isPublished = r => !HIDDEN_STATUS.test(String(r.Status || r.Published || '').trim());
export const SLUG_RE = /^[a-z0-9][a-z0-9._~-]*$/i;

/** Published blog rows with a valid unique slug and a title, newest first. */
export function cleanBlogRows(rows) {
  const seen = new Set();
  return (rows || []).filter(r => {
    const slug = String(r.Slug || '').trim();
    if (!slug || !String(r.Title || '').trim() || !isPublished(r)) return false;
    if (!SLUG_RE.test(slug) || seen.has(slug)) return false;
    seen.add(slug);
    r.Slug = slug;
    return true;
  }).sort((a, b) => dateValue(b.Date) - dateValue(a.Date));
}

// ─────────────────────────────────────────────────────────────────────────
//  Markdown (escape first, then a small safe subset)
// ─────────────────────────────────────────────────────────────────────────

const CALLOUT_TYPES = {
  NOTE:      { icon: '\u2139\uFE0F', cls: 'callout-note',      label: 'Note' },
  TIP:       { icon: '\uD83D\uDCA1', cls: 'callout-tip',       label: 'Tip' },
  WARNING:   { icon: '\u26A0\uFE0F', cls: 'callout-warning',   label: 'Warning' },
  IMPORTANT: { icon: '\uD83D\uDD25', cls: 'callout-important', label: 'Important' },
  INFO:      { icon: '\uD83D\uDCCC', cls: 'callout-info',      label: 'Info' },
};

/**
 * Sheet cell format → lines. Every line after the first starts with "|":
 *   "## Title\n|First paragraph\n|- item"
 * Only ONE leading "|" per line is a separator, so a "|" inside a sentence
 * is kept. Legacy single-line cells ("a|b|c", no newlines) split on "|".
 */
export function sheetToLines(text) {
  const t = String(text ?? '');
  if (!t) return [];
  if (!/\r?\n/.test(t)) return t.split('|');
  return t.split(/\r?\n/).map(l => (l.startsWith('|') ? l.slice(1) : l));
}

/**
 * Date as shown to readers: "October 8, 2026", whatever format the Sheet cell
 * uses ("2026-10-08", "April 18, 2026", …). Unparseable text is shown as-is.
 */
export function displayDate(s) {
  const iso = isoDate(s);
  if (!iso) return String(s ?? '');
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Lines → Sheet cell format (inverse of sheetToLines for normal content). */
export const linesToSheet = lines => lines.join('\n|');

/**
 * Inline markdown → HTML (escape first): **bold**, *italic*, ~~strike~~,
 * `code`, [text](https://…). Shared by the site renderer and the CMS editor.
 * Code spans are protected so * and ~ inside them stay literal.
 */
export const inlineMd = raw => esc(raw)
  .replace(/&#124;/g, '|')
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c.replace(/\*/g, '&#42;').replace(/~/g, '&#126;')}</code>`)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  .replace(/~~(.+?)~~/g, '<del>$1</del>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);

/**
 * Render the Sheet's markdown subset. Raw HTML is always escaped; links
 * must be http(s). imgMap maps '[imgN]' → trusted <figure> HTML.
 */
export function md(text, imgMap = {}) {
  if (!text) return '';
  const toks = {};
  let tokIdx = 0;
  for (const [code, html] of Object.entries(imgMap)) {
    const tok = '\x00SD' + tokIdx++ + '\x00';
    toks[tok] = html;
    text = text.split(code).join(tok);
  }

  const inlineFmt = inlineMd;
  const restoreToks = s => {
    for (const [tok, html] of Object.entries(toks)) if (s.includes(tok)) s = s.split(tok).join(html);
    return s;
  };

  let out = '', inUL = false, inOL = false, inPRE = false;
  const closeList = () => {
    if (inUL) { out += '</ul>'; inUL = false; }
    if (inOL) { out += '</ol>'; inOL = false; }
  };
  const lines = sheetToLines(text);

  for (const raw of lines) {
    if (raw.trim() === '```') {
      if (inPRE) { out += '</code></pre>'; inPRE = false; }
      else       { closeList(); out += '<pre><code>'; inPRE = true; }
      continue;
    }
    if (inPRE) { out += esc(raw) + '\n'; continue; }
    if (raw.trim() in toks) { closeList(); out += toks[raw.trim()]; continue; }

    const l = restoreToks(inlineFmt(raw));
    const callout = l.match(/^&gt;\s*\[!(NOTE|TIP|WARNING|IMPORTANT|INFO)\]\s*(.*)/i);
    if (callout) {
      closeList();
      const cfg = CALLOUT_TYPES[callout[1].toUpperCase()] || CALLOUT_TYPES.NOTE;
      out += `<div class="callout ${cfg.cls}"><div class="callout-header">` +
             `<span class="callout-icon">${cfg.icon}</span><span class="callout-label">${cfg.label}</span></div>` +
             `<div class="callout-body">${callout[2] ? `<p>${callout[2]}</p>` : ''}</div></div>`;
      continue;
    }
    if (/^&gt; /.test(l))         { closeList(); out += `<blockquote><p>${l.slice(5)}</p></blockquote>`; }
    else if (/^## /.test(l))      { closeList(); out += `<h2>${l.slice(3)}</h2>`; }
    else if (/^### /.test(l))     { closeList(); out += `<h3>${l.slice(4)}</h3>`; }
    else if (/^- /.test(l)) {
      if (inOL)  { out += '</ol>'; inOL = false; }
      if (!inUL) { out += '<ul>';  inUL = true; }
      out += `<li>${l.slice(2)}</li>`;
    }
    else if (/^\d+\. /.test(l)) {
      if (inUL)  { out += '</ul>'; inUL = false; }
      if (!inOL) { out += '<ol>';  inOL = true; }
      out += `<li>${l.replace(/^\d+\. /, '')}</li>`;
    }
    else if (l.trim() === '')     { closeList(); }
    else                          { closeList(); out += `<p>${l}</p>`; }
  }
  if (inPRE) out += '</code></pre>';
  closeList();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  Blog
// ─────────────────────────────────────────────────────────────────────────

const rv = reveal => (reveal ? ' reveal' : '');

export function blogCardHTML(post, { reveal = true } = {}) {
  const img  = fixImgUrl(post.Image_URL);
  const tags = splitList(post.Tags);
  return `<a class="blog-card${rv(reveal)}" href="/blog/${esc(post.Slug)}" data-link>` +
    (img
      ? `<div class="blog-card-thumb"><img src="${esc(img)}" alt="${esc(post.Image_Alt || `${post.Title} cover`)}" loading="lazy" decoding="async" width="310" height="172"></div>`
      : `<div class="blog-card-thumb" aria-hidden="true">✍️</div>`) +
    `<div class="blog-card-body"><div class="blog-card-meta">` +
    `<span class="blog-cat">${esc(post.Category || 'Post')}</span>` +
    `<time datetime="${esc(isoDate(post.Date) || post.Date || '')}">${esc(displayDate(post.Date))}</time></div>` +
    `<h3 class="blog-card-title">${esc(post.Title)}</h3>` +
    `<p class="blog-card-excerpt">${esc(post.Excerpt || '')}</p>` +
    (tags.length ? `<div class="blog-card-tags">${tags.map(t => `<span class="blog-tag">${esc(t)}</span>`).join('')}</div>` : '') +
    `</div></a>`;
}

/** Real links so crawlers can reach every page. */
export function paginationHTML(page, total) {
  if (total <= 1) return '';
  const href = n => (n === 1 ? '/blog' : `/blog?page=${n}`);
  return (page > 1 ? `<a class="btn btn-ghost" href="${href(page - 1)}" data-link rel="prev">← Prev</a>` : '') +
    `<span aria-live="polite" aria-atomic="true">Page ${page} of ${total}</span>` +
    (page < total ? `<a class="btn btn-ghost" href="${href(page + 1)}" data-link rel="next">Next →</a>` : '');
}

export function featuredCardHTML(post, { reveal = true } = {}) {
  const img = fixImgUrl(post.Image_URL);
  return `<a class="fp-card${rv(reveal)}" href="/blog/${esc(post.Slug)}" data-link>` +
    (img
      ? `<div class="fp-thumb"><img src="${esc(img)}" alt="${esc(post.Image_Alt || `${post.Title} cover image`)}" loading="lazy" decoding="async" width="400" height="225"></div>`
      : `<div class="fp-thumb" aria-hidden="true">✍️</div>`) +
    `<div class="fp-body"><div class="fp-meta"><span class="fp-cat">${esc(post.Category || 'Post')}</span>` +
    `<time datetime="${esc(isoDate(post.Date) || post.Date || '')}">${esc(displayDate(post.Date))}</time></div>` +
    `<h3 class="fp-title">${esc(post.Title)}</h3>` +
    (post.Excerpt ? `<p class="fp-excerpt">${esc(post.Excerpt)}</p>` : '') +
    `<span class="fp-arrow" aria-hidden="true">Read post →</span></div></a>`;
}

/** Featured slugs (first column) → published posts, sheet order kept. */
export function featuredPosts(featuredRows, blogRows) {
  const bySlug = new Map((blogRows || []).map(p => [p.Slug, p]));
  return (featuredRows || [])
    .map(r => bySlug.get(String(r.Slug || r.slug || Object.values(r)[0] || '').trim()))
    .filter(Boolean);
}

const figureHTML = (url, alt) =>
  `<figure class="blog-figure"><img class="blog-inline-img" src="${esc(url)}" alt="${esc(alt)}" ` +
  `loading="lazy" decoding="async" width="680" height="383"><figcaption>${esc(alt)}</figcaption></figure>`;

/** '[imgN]' → <figure>, from ImgN_URL columns then the images sheet (wins). */
export function buildImgMap(post, imageRows) {
  const map = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^img(\d+)_url$/i);
    const url = m && fixImgUrl(post[key]);
    if (url) map[`[img${m[1]}]`] = figureHTML(url, post[`Img${m[1]}_Alt`] || post.Title || '');
  }
  (imageRows || [])
    .filter(r => String(r.Blog_Slug || '').trim() === post.Slug)
    .forEach(r => {
      const num = Number(r.Img_Number || 0);
      const url = fixImgUrl(r.Img_URL);
      if (num && url) map[`[img${num}]`] = figureHTML(url, String(r.Img_Alt || post.Title || '').trim());
    });
  return map;
}

export function faqPairs(faqRows, slug) {
  return (faqRows || [])
    .filter(r => String(r.Blog_Slug || '').trim() === slug)
    .sort((a, b) => Number(a.FAQ_Number || 0) - Number(b.FAQ_Number || 0))
    .map(r => ({ q: String(r.FAQ_Question || '').trim(), a: String(r.FAQ_Answer || '').trim() }))
    .filter(p => p.q && p.a);
}

export function faqSectionHTML(pairs) {
  if (!pairs.length) return '';
  return `<section class="faq-section" aria-label="Frequently Asked Questions"><h2>Frequently Asked Questions</h2>` +
    pairs.map(p => `<details class="faq-item"><summary class="faq-question">${esc(p.q)}</summary>` +
                   `<div class="faq-answer">${esc(p.a)}</div></details>`).join('') +
    `</section>`;
}

/**
 * Inner HTML of #articleWrap. tableHTML must already be sanitised by the
 * caller (DOMParser allow-list in the browser, HTMLRewriter in the worker).
 */
export function articleHTML(post, { imageRows = [], faqRows = [], tableHTML = '', allPosts = [] } = {}) {
  const cover = fixImgUrl(post.Image_URL);
  const tags  = splitList(post.Tags);
  const published = isoDate(post.Date);
  const modified  = isoDate(post.Last_Modified);
  return `<a class="article-back" href="/blog" data-link>← Back to Blog</a>` +
    `<div class="article-meta"><span class="blog-cat">${esc(post.Category || 'Post')}</span>` +
    `<time datetime="${esc(published || post.Date || '')}">${esc(displayDate(post.Date))}</time>` +
    // Visible freshness signal for readers, search engines and answer engines
    (modified && published && modified > published
      ? `<span class="article-updated">Updated <time datetime="${modified}">${esc(displayDate(modified))}</time></span>` : '') +
    `</div>` +
    `<h1 class="article-title">${esc(post.Title)}</h1>` +
    (tags.length ? `<div class="article-tags">${tags.map(t => `<span class="article-tag">${esc(t)}</span>`).join('')}</div>` : '') +
    (cover ? `<img class="article-cover" src="${esc(cover)}" alt="${esc(post.Image_Alt || `${post.Title} featured image`)}" ` +
             `loading="eager" decoding="async" fetchpriority="high" width="720" height="420">` : '') +
    `<div class="article-body">${md(post.Content || '', buildImgMap(post, imageRows))}` +
    (tableHTML ? `<div class="sheet-html-block">${tableHTML}</div>` : '') + `</div>` +
    `<div class="article-author"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>` +
    `<span>Written by <a href="/about" data-link>Suman Dangal</a></span></div>` +
    faqSectionHTML(faqPairs(faqRows, post.Slug)) +
    postNavHTML(post, allPosts) +
    relatedHTML(post, allPosts);
}

// ─────────────────────────────────────────────────────────────────────────
//  Internal linking between posts: every post links to its older/newer
//  neighbour and up to 3 related posts (same category, shared tags, recent).
// ─────────────────────────────────────────────────────────────────────────

/** Older and newer post (allPosts sorted newest first, as cleanBlogRows returns). */
export function postNeighbours(post, allPosts = []) {
  const i = allPosts.findIndex(p => p.Slug === post.Slug);
  if (i === -1) return { newer: null, older: null };
  return { newer: allPosts[i - 1] || null, older: allPosts[i + 1] || null };
}

export function postNavHTML(post, allPosts = []) {
  const { newer, older } = postNeighbours(post, allPosts);
  if (!newer && !older) return '';
  const link = (p, dir) => p
    ? `<a class="post-nav-link post-nav-${dir}" href="/blog/${esc(p.Slug)}" data-link rel="${dir === 'older' ? 'prev' : 'next'}">` +
      `<span class="post-nav-dir">${dir === 'older' ? '← Older post' : 'Newer post →'}</span>` +
      `<span class="post-nav-title">${esc(p.Title)}</span></a>`
    : '<span></span>';
  return `<nav class="post-nav" aria-label="More posts">${link(older, 'older')}${link(newer, 'newer')}</nav>`;
}

/** Up to n related posts: same category > shared tags > newest; excludes neighbours. */
export function relatedPosts(post, allPosts = [], n = 3) {
  const { newer, older } = postNeighbours(post, allPosts);
  const skip = new Set([post.Slug, newer?.Slug, older?.Slug].filter(Boolean));
  const myTags = new Set(splitList(post.Tags).map(t => t.toLowerCase()));
  const cat = String(post.Category || '').trim().toLowerCase();
  return allPosts
    .filter(p => !skip.has(p.Slug))
    .map((p, i) => ({
      p, i,
      score: (cat && String(p.Category || '').trim().toLowerCase() === cat ? 10 : 0) +
             splitList(p.Tags).filter(t => myTags.has(t.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, n)
    .map(x => x.p);
}

export function relatedHTML(post, allPosts = []) {
  const list = relatedPosts(post, allPosts);
  if (!list.length) return '';
  return `<section class="related-posts" aria-label="Related posts"><h2>Related posts</h2>` +
    `<div class="blog-grid related-grid">${list.map(p => blogCardHTML(p, { reveal: false })).join('')}</div></section>`;
}

/** Google shows ~60 characters: drop the site name when it would not fit. */
export function pageTitle(title) {
  const full = `${title} | ${SITE_NAME}`;
  return full.length <= 60 ? full : String(title);
}

/** Words in a post (markdown symbols and image placeholders ignored). */
export function postWordCount(post) {
  return sheetToLines(post.Content || '').join(' ')
    .replace(/\[img\d+\]/gi, ' ').replace(/\]\([^)]*\)/g, ' ')
    .replace(/[#>*`~|_[\]()!-]+/g, ' ')
    .split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Clean markdown version of a post for AI agents and answer engines
 * (/blog/<slug>.md, /llms-full.txt): metadata header, the post's own
 * markdown with images resolved, then the FAQ.
 */
export function postMarkdown(post, { imageRows = [], faqRows = [], tableHTML = '' } = {}) {
  const url = `${SITE_URL}/blog/${post.Slug}`;
  const images = {};
  for (const key of Object.keys(post)) {
    const m = key.match(/^img(\d+)_url$/i);
    const u = m && fixImgUrl(post[key]);
    if (u) images[m[1]] = { url: u, alt: post[`Img${m[1]}_Alt`] || post.Title };
  }
  (imageRows || []).filter(r => String(r.Blog_Slug || '').trim() === post.Slug).forEach(r => {
    const u = fixImgUrl(r.Img_URL);
    if (Number(r.Img_Number) && u) images[Number(r.Img_Number)] = { url: u, alt: String(r.Img_Alt || post.Title).trim() };
  });
  const body = sheetToLines(post.Content || '').map(l => {
    const m = l.trim().match(/^\[img(\d+)\]$/i);
    if (!m) return l;
    const im = images[Number(m[1])];
    return im ? `![${im.alt.replace(/[[\]]/g, '')}](${im.url})` : '';
  });
  const published = isoDate(post.Date), modified = isoDate(post.Last_Modified);
  const pairs = faqPairs(faqRows, post.Slug);
  return [
    `# ${post.Title}`, '',
    ...(post.Excerpt ? [`> ${post.Excerpt}`, ''] : []),
    `- Author: ${SITE_NAME} (${SITE_URL}/about)`,
    ...(published ? [`- Published: ${published}`] : []),
    ...(modified && modified !== published ? [`- Updated: ${modified}`] : []),
    ...(post.Category ? [`- Category: ${post.Category}`] : []),
    ...(splitList(post.Tags).length ? [`- Tags: ${splitList(post.Tags).join(', ')}`] : []),
    `- Canonical URL: ${url}`, '',
    ...body, '',
    ...(tableHTML ? [tableHTML, ''] : []), // sanitised HTML table: valid inside markdown
    ...(pairs.length ? ['## Frequently Asked Questions', '', ...pairs.flatMap(p => [`### ${p.q}`, '', p.a, ''])] : []),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function notFoundHTML(path, { article = false } = {}) {
  return `<div class="not-found-wrap"><span class="not-found-code" aria-hidden="true">404</span>` +
    `<h1>${article ? 'Post not found' : 'Page not found'}</h1>` +
    `<p>The page <code style="font-family:var(--mono);color:var(--accent)">${esc(path)}</code> doesn't exist.</p>` +
    `<a href="${article ? '/blog' : '/'}" class="btn btn-solid" data-link>${article ? '← Browse all posts' : '← Back to Home'}</a></div>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  Skills / projects / experience / about
// ─────────────────────────────────────────────────────────────────────────

const SKILL_COLORS = new Set(['green', 'blue', 'amber']);
/** "blue" or "c-blue" → "c-blue"; anything else → "c-green". */
export const skillColor = c => {
  const v = String(c || '').trim().toLowerCase().replace(/^c-/, '');
  return `c-${SKILL_COLORS.has(v) ? v : 'green'}`;
};
/** Sheet checkbox / text booleans: TRUE, true, yes, 1, ✓ */
export const truthy = v => /^(true|yes|y|1|✓|x)$/i.test(String(v ?? '').trim());

/**
 * List tabs (Projects, Skills, Experience): drop hidden (Status) and empty
 * rows, then sort by an optional numeric "Order" column (sheet order otherwise).
 */
export function cleanListRows(rows, required) {
  return (rows || [])
    .filter(r => isPublished(r) && String(r[required] || '').trim())
    .map((r, i) => ({ r, i, o: Number.parseFloat(r.Order) }))
    .sort((a, b) => (isNaN(a.o) ? 1e9 : a.o) - (isNaN(b.o) ? 1e9 : b.o) || a.i - b.i)
    .map(x => x.r);
}
export const LIST_REQUIRED = { projects: 'title', skills: 'title', exp: 'role' };

export function skillsHTML(rows, { reveal = true } = {}) {
  return rows.map(r => {
    const color = skillColor(r.color);
    return `<div class="skill-card ${color}${rv(reveal)}"><div class="skill-icon" aria-hidden="true">${esc(r.icon || '💡')}</div>` +
      `<div class="skill-name">${esc(r.title)}</div><div class="tag-row">` +
      splitList(r.tags).map(t => `<span class="tag">${esc(t)}</span>`).join('') + `</div></div>`;
  }).join('');
}

const VISUALS = [
  [['django', 'python'], '🐍'], [['android', 'bluetooth', 'java'], '📱'], [['php', 'mysql', 'mariadb'], '🐘'],
  [['react', 'vue', 'next', 'svelte'], '⚛️'], [['node', 'express', 'deno'], '🟢'], [['wordpress', 'cms'], '📝'],
  [['shop', 'ecommerce', 'cart', 'store'], '🛒'], [['library', 'book', 'edu'], '📚'], [['api', 'rest', 'graphql'], '🔌'],
];
function pickVisual(row) {
  if (String(row.visual || '').trim()) return row.visual.trim();
  const hay = `${row.stack || ''} ${row.title || ''}`.toLowerCase();
  return (VISUALS.find(([keys]) => keys.some(k => hay.includes(k))) || [, '🚀'])[1];
}

export function projectsHTML(rows, { reveal = true } = {}) {
  return rows.map((r, i) => {
    // Sheet columns: num, title, desc, highlights, stack, link, featured, span2
    // (older names bullets / wide still accepted)
    const feat = truthy(r.featured);
    const wide = truthy(r.span2 ?? r.wide);
    const link = /^https?:/i.test(safeUrl(r.link)) ? safeUrl(r.link) : '';
    const bullets = splitList(r.highlights ?? r.bullets, '|');
    const stack = splitList(r.stack);
    const num = String(r.num || '').trim() || String(i + 1);
    return `<article class="proj-card${rv(reveal)}${feat ? ' feat' : ''}${wide ? ' wide' : ''}"><div>` +
      `<div class="proj-num">${esc(/^\d+$/.test(num) ? num.padStart(2, '0') : num)}${feat ? ' / Featured' : ''}</div>` +
      `<h3 class="proj-title">${esc(r.title)}</h3>` +
      (String(r.desc || '').trim() ? `<p class="proj-desc">${esc(r.desc.trim())}</p>` : '') +
      (bullets.length ? `<ul class="proj-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '') +
      (stack.length ? `<div class="proj-stack">${stack.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '') +
      (String(r.note || '').trim() ? `<p class="proj-note">${esc(r.note.trim())}</p>` : '') +
      (link ? `<div class="proj-links"><a href="${esc(link)}" class="btn btn-solid" target="_blank" rel="noopener noreferrer">View Project ↗</a></div>` : '') +
      `</div>` +
      (feat ? `<div class="proj-visual" aria-hidden="true">${esc(pickVisual(r))}</div>` : '') +
      `</article>`;
  }).join('');
}

const TL_TYPES = new Set(['work', 'project', 'volunteer', 'education']);

export function timelineHTML(rows, { reveal = true } = {}) {
  return rows.map(r => {
    const type = TL_TYPES.has(String(r.type || '').trim().toLowerCase()) ? r.type.trim().toLowerCase() : 'work';
    const dt = String(r.datetime || r.date || '').trim();
    const bullets = splitList(r.bullets, '|');
    const org = String(r.org || '').trim();
    return `<div class="tl-item${rv(reveal)}" data-type="${type}"><div class="tl-dot" aria-hidden="true"></div>` +
      `<time class="tl-date"${dt ? ` datetime="${esc(dt)}"` : ''}>${esc(String(r.date || '').trim())}</time>` +
      `<h3 class="tl-role">${esc(String(r.role || '').trim())}</h3>` +
      (org ? `<div class="tl-org">${esc(org)}</div>` : '') +
      (bullets.length ? `<ul class="tl-list" aria-label="${esc(`Responsibilities at ${org || r.role || ''}`)}">` +
        bullets.map(b => `<li>${esc(b)}</li>`).join('') + `</ul>` : '') +
      `</div>`;
  }).join('');
}

/** About sheet: bio1..bio4 columns, or one "bio" cell split on '|'. */
export function aboutParas(rows) {
  const row = (rows || [])[0];
  if (!row) return [];
  const cols = ['bio1', 'bio2', 'bio3', 'bio4'].map(k => String(row[k] || '').trim()).filter(Boolean);
  return cols.length ? cols : splitList(row.bio || row.Bio, '|');
}

export const aboutHTML = paras => paras.map(p => `<p>${esc(p)}</p>`).join('');

// ─────────────────────────────────────────────────────────────────────────
//  JSON-LD builders
// ─────────────────────────────────────────────────────────────────────────

const ctx = { '@context': 'https://schema.org' };
const person = () => ({
  '@type': 'Person', '@id': `${SITE_URL}/#person`, name: SITE_NAME, url: `${SITE_URL}/`,
  jobTitle: 'Dev & QA Engineer', image: DEFAULT_IMAGE,
  address: { '@type': 'PostalAddress', addressLocality: 'Bhaktapur', addressCountry: 'NP' },
  sameAs: [LINKEDIN_URL, 'https://facebook.com/suman.dangal.5'],
});
const author = () => ({ '@type': 'Person', '@id': `${SITE_URL}/#person`, name: SITE_NAME, url: `${SITE_URL}/` });

export const websiteLD = () => ({ ...ctx, '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/`, inLanguage: 'en' });
export const profilePageLD = () => ({ ...ctx, '@type': 'ProfilePage', url: `${SITE_URL}/`, mainEntity: person() });

export function breadcrumbLD(crumbs) {
  return { ...ctx, '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) };
}

export function blogPostingLD(post) {
  const url = `${SITE_URL}/blog/${post.Slug}`;
  const published = isoDate(post.Date);
  const tags = splitList(post.Tags);
  return { ...ctx, '@type': 'BlogPosting', headline: post.Title,
    description: post.Excerpt || undefined, url, mainEntityOfPage: url,
    image: fixImgUrl(post.Image_URL) || DEFAULT_IMAGE, inLanguage: 'en',
    author: author(), publisher: author(),
    ...(published ? { datePublished: published, dateModified: isoDate(post.Last_Modified) || published } : {}),
    ...(post.Category ? { articleSection: post.Category } : {}),
    wordCount: postWordCount(post),
    ...(tags.length ? { keywords: tags.join(', ') } : {}) };
}

export const faqLD = pairs => ({ ...ctx, '@type': 'FAQPage',
  mainEntity: pairs.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.a } })) });

export const blogLD = posts => ({ ...ctx, '@type': 'Blog', name: `${SITE_NAME} Blog`, url: `${SITE_URL}/blog`,
  blogPost: posts.map(p => ({ '@type': 'BlogPosting', headline: p.Title, url: `${SITE_URL}/blog/${p.Slug}` })) });

/** Plain-text description fallback from markdown (≤155 chars). */
export function plainExcerpt(text) {
  const t = String(text || '').replace(/\[img\d+\]/gi, ' ').replace(/[#>*`|_[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 155 ? t.slice(0, 152).replace(/\s\S*$/, '') + '…' : t;
}

// ─────────────────────────────────────────────────────────────────────────
//  Site tab (Key | Value) — every one-off text on the site
//  `def` = current text (fallback when the Sheet has no row for the key).
//  index.html marks elements with data-site="key"; the worker fills them.
// ─────────────────────────────────────────────────────────────────────────

export const SITE_FIELDS = [
  // group, key, label, default, type (text | textarea | email | tel | url | path)
  ['Home', 'hero_badge', 'Badge above the title', 'Available for Internship & Junior Roles'],
  ['Home', 'hero_title', 'Big title (new line = line break, *word* = accent colour)', 'Dev & QA\n*Engineer*', 'textarea'],
  ['Home', 'hero_subtitle', 'Text under the title', "Final-year BCA student building and testing full-stack web and mobile applications. I write clean code and break things carefully — so users don't have to.", 'textarea'],
  ['Home', 'hero_cta_text', 'Button text', 'View Projects ↓'],
  ['Home', 'hero_cta_link', 'Button link (e.g. /projects)', '/projects', 'path'],
  ['Home', 'stat1_num', 'Stat 1 number (empty = hide)', '4+'],
  ['Home', 'stat1_label', 'Stat 1 label', 'Projects Built'],
  ['Home', 'stat2_num', 'Stat 2 number (empty = hide)', '3+'],
  ['Home', 'stat2_label', 'Stat 2 label', 'Years Coding'],
  ['Home', 'featured_eyebrow', 'Featured posts — small label', 'From the blog'],
  ['Home', 'featured_heading', 'Featured posts — heading', 'Featured Posts'],
  ['Home', 'featured_view_all', 'Featured posts — link text', 'View all posts →'],
  ['Sections', 'skills_eyebrow', 'Skills — small label', 'What I Work With'],
  ['Sections', 'skills_heading', 'Skills — heading', 'Skills & Stack'],
  ['Sections', 'projects_eyebrow', 'Projects — small label', "What I've Built"],
  ['Sections', 'projects_heading', 'Projects — heading', 'Projects'],
  ['Sections', 'blog_eyebrow', 'Blog — small label', 'Writing & Notes'],
  ['Sections', 'blog_heading', 'Blog — heading', 'Blog'],
  ['Sections', 'experience_eyebrow', 'Experience — small label', 'Work History'],
  ['Sections', 'experience_heading', 'Experience — heading', 'Experience'],
  ['Sections', 'about_eyebrow', 'About — small label', 'Background'],
  ['Sections', 'about_heading', 'About — heading', 'About Me'],
  ['Sections', 'contact_eyebrow', 'Contact — small label', "Let's Connect"],
  ['Sections', 'contact_heading', 'Contact — heading', 'Get In Touch'],
  ['Sections', 'contact_intro', 'Contact — intro text', "Looking for a Dev or QA intern? I'm actively seeking opportunities — let's talk.", 'textarea'],
  ['About sidebar', 'about_location', 'Location', 'Balkot, Bhaktapur, Nepal'],
  ['About sidebar', 'about_availability', 'Availability', 'Open to Opportunities'],
  ['About sidebar', 'about_languages', 'Languages', 'English · Nepali · Hindi'],
  ['About sidebar', 'about_focus', 'Focus', 'Full-Stack Dev, QA Testing'],
  ['About sidebar', 'about_email', 'Email shown on About (empty = hide)', 'sumandangal888@gmail.com', 'email'],
  ['About sidebar', 'edu_degree', 'Education — degree', 'Bachelor in Computer Applications (BCA)'],
  ['About sidebar', 'edu_details', 'Education — details', 'Tribhuvan University · 2021–Present · Bhaktapur, Nepal'],
  ['Contact', 'contact_email', 'Email (empty = hide tile)', 'sumandangal888@gmail.com', 'email'],
  ['Contact', 'contact_linkedin', 'LinkedIn URL (empty = hide)', 'https://linkedin.com/in/sumandangal963', 'url'],
  ['Contact', 'contact_phone', 'Phone (empty = hide)', '+977 9803340063', 'tel'],
  ['Contact', 'contact_github', 'GitHub URL (empty = hide)', '', 'url'],
  ['Contact', 'contact_facebook', 'Facebook URL (empty = hide)', '', 'url'],
  ['Footer & banner', 'footer_left', 'Footer left', '© 2026 Suman Dangal'],
  ['Footer & banner', 'footer_right', 'Footer right', 'Built with ❤️ · Balkot, Bhaktapur, Nepal'],
  ['Footer & banner', 'consent_text', 'Cookie banner text', 'I use Google Analytics cookies to see which pages are read. No ads, nothing sold.', 'textarea'],
  ...Object.entries(ROUTES).flatMap(([path, m]) => [
    ['SEO', `meta_title_${m.view}`, `${path} — page title (Google, browser tab)`, m.title],
    ['SEO', `meta_desc_${m.view}`, `${path} — description (Google snippet, about 155 characters)`, m.description, 'textarea'],
  ]),
].map(([group, key, label, def, type = 'text']) => ({ group, key, label, def, type }));

export const SITE_KEYS = new Set(SITE_FIELDS.map(f => f.key));
export const SITE_FIELD = Object.fromEntries(SITE_FIELDS.map(f => [f.key, f]));

/** Site tab rows → { key: value } (unknown keys ignored, values trimmed). */
export function siteMap(rows) {
  const map = {};
  for (const r of rows || []) {
    const k = String(r.Key || '').trim();
    if (SITE_KEYS.has(k)) map[k] = String(r.Value ?? '').replace(/\r\n?/g, '\n').trim();
  }
  return map;
}

/** Site value → inline HTML: escaped, *em* **strong** links, new line → <br>. */
export const siteValueHTML = v => String(v ?? '').split('\n').map(inlineMd).join('<br>');

/** HTML entities for every character (emails), so naive scrapers don't read them. */
export const obfuscate = s => [...String(s ?? '')].map(c => `&#${c.codePointAt(0)};`).join('');

/** href for a Site value: mailto:/tel:/https URL/site path, or '' if unsafe. */
export function siteHref(value, type) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (type === 'email') return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v) ? `mailto:${v}` : '';
  if (type === 'tel') return /^\+?[\d\s()-]{6,20}$/.test(v) ? `tel:${v.replace(/[^\d+]/g, '')}` : '';
  if (type === 'path') return /^\/(?!\/)[\w\-./?=&#]*$/.test(v) || /^https:\/\/\S+$/i.test(v) ? v : '';
  return /^https?:\/\/[^\s"<>]+$/i.test(v) ? v : '';
}

/** Text shown for a link tile: URLs without the https://www. prefix. */
export const siteLinkText = (value, type) =>
  type === 'url' ? String(value).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : String(value);

/** Route title/description/heading with Site overrides. */
export function routeMeta(path, site = {}) {
  const m = ROUTES[path];
  if (!m) return null;
  return {
    ...m,
    title: site[`meta_title_${m.view}`] || m.title,
    description: site[`meta_desc_${m.view}`] || m.description,
    heading: site[`${m.view}_heading`] || m.heading,
  };
}
