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
  '/contact':    { view: 'contact',    css: ['/css/about.css'],    heading: 'Contact',
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
    `<time datetime="${esc(isoDate(post.Date) || post.Date || '')}">${esc(post.Date || '')}</time></div>` +
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
    `<time datetime="${esc(isoDate(post.Date) || post.Date || '')}">${esc(post.Date || '')}</time></div>` +
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
export function articleHTML(post, { imageRows = [], faqRows = [], tableHTML = '' } = {}) {
  const cover = fixImgUrl(post.Image_URL);
  const tags  = splitList(post.Tags);
  return `<a class="article-back" href="/blog" data-link>← Back to Blog</a>` +
    `<div class="article-meta"><span class="blog-cat">${esc(post.Category || 'Post')}</span>` +
    `<time datetime="${esc(isoDate(post.Date) || post.Date || '')}">${esc(post.Date || '')}</time></div>` +
    `<h1 class="article-title">${esc(post.Title)}</h1>` +
    (tags.length ? `<div class="article-tags">${tags.map(t => `<span class="article-tag">${esc(t)}</span>`).join('')}</div>` : '') +
    (cover ? `<img class="article-cover" src="${esc(cover)}" alt="${esc(post.Image_Alt || `${post.Title} featured image`)}" ` +
             `loading="eager" decoding="async" fetchpriority="high" width="720" height="420">` : '') +
    `<div class="article-body">${md(post.Content || '', buildImgMap(post, imageRows))}` +
    (tableHTML ? `<div class="sheet-html-block">${tableHTML}</div>` : '') + `</div>` +
    `<div class="article-author"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>` +
    `<span>Written by <a href="/about" data-link>Suman Dangal</a></span></div>` +
    faqSectionHTML(faqPairs(faqRows, post.Slug));
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

const SKILL_COLORS = new Set(['c-green', 'c-blue', 'c-amber']);

export function skillsHTML(rows, { reveal = true } = {}) {
  return rows.map(r => {
    const color = SKILL_COLORS.has(String(r.color || '').trim()) ? r.color.trim() : 'c-green';
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
    const feat = r.featured === 'true';
    const link = /^https?:/i.test(safeUrl(r.link)) ? safeUrl(r.link) : '';
    const bullets = splitList(r.bullets, '|');
    const stack = splitList(r.stack);
    return `<article class="proj-card${rv(reveal)}${feat ? ' feat' : ''}${r.wide === 'true' ? ' wide' : ''}"><div>` +
      `<div class="proj-num">${String(i + 1).padStart(2, '0')}${feat ? ' / Featured' : ''}</div>` +
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
