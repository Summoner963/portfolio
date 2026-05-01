// js/seo.js
// ═══════════════════════════════════════════════════════════════════════════
//  Client-side SEO layer.
//
//  Responsibilities:
//   - updateSEO(): update all <head> meta tags + h1 visibility per route.
//   - injectSchema(): generic JSON-LD injector (idempotent by id).
//   - Structured data builders:
//       buildBreadcrumb()      → BreadcrumbList
//       buildBlogPosting()     → BlogPosting
//       buildMusicComposition()→ MusicComposition  (chord pages)
//       buildFAQSchema()       → FAQPage           (re-exported from api.js)
//       buildPersonSchema()    → Person (home only, static)
//   - removeSchema(): clean up dynamic schemas on route change.
//
//  Design:
//   - Every <script type="application/ld+json"> has a stable id so
//     repeated navigations update rather than accumulate.
//   - updateSEO() is the single call each view makes — it handles
//     title, description, canonical, og:*, twitter:*, h1, breadcrumb,
//     and robots in one shot.
//   - MusicComposition schema added for /chords/:slug pages per Section 5.
// ═══════════════════════════════════════════════════════════════════════════

import { esc }     from './utils.js';
import { CFG }     from './api.js';


// ─────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Set a <meta> tag's content by CSS selector.
 * If the element doesn't exist, create it and append to <head>.
 * @param {string} selector  — e.g. 'meta[name="description"]'
 * @param {string} attr      — attribute to set, e.g. 'content'
 * @param {string} value
 * @param {Record<string,string>} [createAttrs] — attrs to set on creation
 */
function setMeta(selector, attr, value, createAttrs = {}) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    Object.entries(createAttrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Set or update a <link> tag by id.
 * @param {string} id
 * @param {string} rel
 * @param {string} href
 */
function setLink(id, rel, href) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('link');
    el.id  = id;
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}


// ─────────────────────────────────────────────────────────────────────────
//  injectSchema
//  Idempotent JSON-LD injector — updates existing tag if id already exists.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Inject or update a <script type="application/ld+json"> tag.
 * @param {string} id      — stable DOM id for this schema block
 * @param {object} schema  — plain object; will be JSON.stringify'd
 */
export function injectSchema(id, schema) {
  let el = document.getElementById(id);
  if (!el) {
    el      = document.createElement('script');
    el.id   = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);
}

/**
 * Remove a schema block by id. No-op if it doesn't exist.
 * @param {string} id
 */
export function removeSchema(id) {
  document.getElementById(id)?.remove();
}

/**
 * Remove a list of schema blocks at once.
 * Useful on route change to clear page-specific structured data.
 * @param {string[]} ids
 */
export function removeSchemas(ids = []) {
  ids.forEach(removeSchema);
}


// ─────────────────────────────────────────────────────────────────────────
//  Structured data builders
// ─────────────────────────────────────────────────────────────────────────

/**
 * Inject a BreadcrumbList schema.
 * @param {Array<{name: string, url: string}>} crumbs
 */
export function buildBreadcrumb(crumbs) {
  injectSchema('bc-schema', {
    '@context':      'https://schema.org',
    '@type':         'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type':   'ListItem',
      position:   i + 1,
      name:       c.name,
      item:       c.url,
    })),
  });
}

/**
 * Inject a BlogPosting schema for a single article.
 * @param {{
 *   title:    string,
 *   excerpt:  string,
 *   date:     string,
 *   imageUrl: string,
 *   tags:     string[],
 *   slug:     string,
 * }} meta
 */
export function buildBlogPosting(meta) {
  const url = `${CFG.siteUrl}/blog/${meta.slug}`;
  injectSchema('dyn-schema', {
    '@context':    'https://schema.org',
    '@type':       'BlogPosting',
    headline:       meta.title,
    description:    meta.excerpt,
    datePublished:  meta.date,
    dateModified:   meta.date,
    url,
    inLanguage:    'en',
    keywords:      (meta.tags || []).join(', '),
    ...(meta.imageUrl ? {
      image: {
        '@type':  'ImageObject',
        url:       meta.imageUrl,
        width:     1200,
        height:    630,
      },
    } : {}),
    author: {
      '@type': 'Person',
      name:    'Suman Dangal',
      url:     `${CFG.siteUrl}/`,
      sameAs:  ['https://linkedin.com/in/sumandangal963'],
    },
    publisher: {
      '@type': 'Person',
      name:    'Suman Dangal',
      url:     `${CFG.siteUrl}/`,
    },
  });
}

/**
 * Inject a MusicComposition schema for a chord detail page.
 * https://schema.org/MusicComposition
 *
 * @param {{
 *   title:       string,
 *   artist:      string,
 *   album:       string,
 *   year:        string,
 *   key:         string,
 *   tags:        string[],
 *   slug:        string,
 *   excerpt:     string,
 *   imageUrl:    string,
 *   bpm:         string,
 *   difficulty:  string,
 * }} meta
 */
export function buildMusicComposition(meta) {
  const url = `${CFG.siteUrl}/chords/${meta.slug}`;
  injectSchema('chord-schema', {
    '@context':          'https://schema.org',
    '@type':             'MusicComposition',
    name:                 meta.title,
    composer: {
      '@type': 'MusicGroup',
      name:     meta.artist || 'Unknown Artist',
    },
    ...(meta.album ? { includedInDataCatalog: { '@type': 'DataCatalog', name: meta.album } } : {}),
    ...(meta.year  ? { dateCreated: meta.year } : {}),
    musicalKey:           meta.key   || '',
    url,
    description:          meta.excerpt || `Chord sheet for ${meta.title} by ${meta.artist}.`,
    inLanguage:          'en',
    keywords:            (meta.tags || []).join(', '),
    ...(meta.imageUrl ? {
      image: {
        '@type':  'ImageObject',
        url:       meta.imageUrl,
        width:     1200,
        height:    630,
      },
    } : {}),
    // Credit the site as publisher
    publisher: {
      '@type': 'Person',
      name:    'Suman Dangal',
      url:     `${CFG.siteUrl}/`,
    },
  });
}

/**
 * Inject the static Person + Organization + WebSite schemas.
 * Called once on the home route; persists for the session because
 * these schemas are route-independent.
 */
export function buildHomeSchemas() {
  injectSchema('static-person-schema', {
    '@context': 'https://schema.org',
    '@type':    'Person',
    name:        'Suman Dangal',
    url:         `${CFG.siteUrl}/`,
    email:       'sumandangal888@gmail.com',
    jobTitle:    'Dev & QA Engineer',
    address: {
      '@type':          'PostalAddress',
      addressLocality:  'Bhaktapur',
      addressCountry:   'NP',
    },
    sameAs: ['https://linkedin.com/in/sumandangal963'],
  });

  injectSchema('static-org-schema', {
    '@context': 'https://schema.org',
    '@type':    'Organization',
    name:        'Suman Dangal',
    url:         `${CFG.siteUrl}/`,
    logo: {
      '@type':  'ImageObject',
      url:      `${CFG.siteUrl}/og.png`,
      width:     1200,
      height:    630,
    },
  });

  injectSchema('static-website-schema', {
    '@context':      'https://schema.org',
    '@type':         'WebSite',
    name:             'Suman Dangal',
    url:              `${CFG.siteUrl}/`,
    potentialAction: {
      '@type':       'SearchAction',
      target:        `${CFG.siteUrl}/blog?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────
//  updateSEO — the single call each view makes on every navigation
//
//  Updates in one shot:
//   <title>
//   meta[name="description"]
//   meta[name="robots"]
//   link[rel="canonical"]
//   og:title, og:description, og:url, og:image, og:type
//   twitter:title, twitter:description, twitter:image
//   h1 visibility (home shows it; all other routes hide it)
//   BreadcrumbList schema
//   BlogPosting / MusicComposition schema (if articleMeta / chordMeta given)
//   Cleanup of stale page-specific schemas
// ─────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SEOOptions
 * @property {string}  [title]       — Page title (without site suffix)
 * @property {string}  [desc]        — Meta description
 * @property {string}  [path]        — Canonical path, e.g. '/blog/my-post'
 * @property {string}  [ogImage]     — Absolute URL for og:image / twitter:image
 * @property {string}  [ogType]      — og:type override (default 'website')
 * @property {boolean} [noindex]     — Set robots to noindex,nofollow
 * @property {{
 *   title:   string,
 *   excerpt: string,
 *   date:    string,
 *   imageUrl:string,
 *   tags:    string[],
 *   slug:    string,
 * }} [articleMeta]                  — Triggers BlogPosting schema
 * @property {{
 *   title:      string,
 *   artist:     string,
 *   album:      string,
 *   year:       string,
 *   key:        string,
 *   tags:       string[],
 *   slug:       string,
 *   excerpt:    string,
 *   imageUrl:   string,
 *   bpm:        string,
 *   difficulty: string,
 * }} [chordMeta]                    — Triggers MusicComposition schema
 */

/**
 * Update all SEO-related <head> elements and structured data for a route.
 * @param {SEOOptions} [opts]
 */
export function updateSEO(opts = {}) {
  const {
    title,
    desc,
    path      = '/',
    ogImage,
    ogType    = 'website',
    noindex   = false,
    articleMeta,
    chordMeta,
  } = opts;

  const fullTitle = title
    ? `${title} | Suman Dangal`
    : 'Suman Dangal — Dev & QA Engineer';

  const metaDesc = desc
    || 'Final-year BCA student. Full-stack Dev & QA. Open to internships in Nepal.';

  const canonicalUrl = `${CFG.siteUrl}${path}`;

  const defaultOgImage = `${CFG.siteUrl}/og.png`;
  const resolvedImage  = ogImage || defaultOgImage;

  // ── <title> ──────────────────────────────────────────────────────────
  document.title = fullTitle;

  // ── <meta name="description"> ────────────────────────────────────────
  setMeta(
    'meta[name="description"]', 'content', metaDesc,
    { name: 'description' }
  );

  // ── <meta name="robots"> ─────────────────────────────────────────────
  setMeta(
    'meta[name="robots"]', 'content',
    noindex ? 'noindex, nofollow' : 'index, follow',
    { name: 'robots' }
  );

  // ── <link rel="canonical"> ───────────────────────────────────────────
  setLink('canonical', 'canonical', canonicalUrl);

  // ── Open Graph ───────────────────────────────────────────────────────
  setMeta('meta[property="og:title"]',       'content', fullTitle,      { property: 'og:title' });
  setMeta('meta[property="og:description"]', 'content', metaDesc,       { property: 'og:description' });
  setMeta('meta[property="og:url"]',         'content', canonicalUrl,   { property: 'og:url' });
  setMeta('meta[property="og:image"]',       'content', resolvedImage,  { property: 'og:image' });
  setMeta('meta[property="og:type"]',        'content', ogType,         { property: 'og:type' });
  setMeta('meta[property="og:site_name"]',   'content', 'Suman Dangal', { property: 'og:site_name' });

  // Article-specific OG tags
  if (articleMeta) {
    setMeta('meta[property="og:type"]',                    'content', 'article',          { property: 'og:type' });
    setMeta('meta[property="article:published_time"]',     'content', articleMeta.date,   { property: 'article:published_time' });
    setMeta('meta[property="article:author"]',             'content', 'Suman Dangal',     { property: 'article:author' });
  }

  // ── Twitter Card ─────────────────────────────────────────────────────
  setMeta('meta[name="twitter:card"]',        'content', 'summary_large_image', { name: 'twitter:card' });
  setMeta('meta[name="twitter:title"]',       'content', fullTitle,             { name: 'twitter:title' });
  setMeta('meta[name="twitter:description"]', 'content', metaDesc,              { name: 'twitter:description' });
  setMeta('meta[name="twitter:image"]',       'content', resolvedImage,         { name: 'twitter:image' });

  // ── h1 visibility ────────────────────────────────────────────────────
  // The hero <h1> is only visible on the home route.
  // On all other routes it's hidden so it doesn't create a duplicate h1
  // (each view provides its own visible heading via .section-heading).
  const h1El   = document.getElementById('site-h1');
  const isHome = path === '/' || path === '';
  if (h1El) {
    h1El.style.display = isHome ? '' : 'none';
    h1El.classList.toggle('h1-hidden', !isHome);
  }

  // ── Structured data: BreadcrumbList ──────────────────────────────────
  const crumbs = [{ name: 'Home', url: `${CFG.siteUrl}/` }];
  if (title) crumbs.push({ name: title, url: canonicalUrl });
  buildBreadcrumb(crumbs);

  // ── Structured data: page-specific schemas ────────────────────────────
  // Remove schemas from previous navigation before injecting new ones.
  removeSchemas(['dyn-schema', 'chord-schema', 'faq-schema']);

  if (articleMeta) {
    buildBlogPosting(articleMeta);
  }

  if (chordMeta) {
    buildMusicComposition(chordMeta);
  }

  // ── Home: inject static Person/Org/WebSite schemas ───────────────────
  if (isHome) {
    buildHomeSchemas();
  }
}