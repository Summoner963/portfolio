// js/seo.js
// ═══════════════════════════════════════════════════════════════════════════
//  Client-side SEO layer — keeps <head> correct during SPA navigation.
//  The worker renders the same tags for the first page load; both use the
//  builders and script ids from js/shared/render.js, so client updates
//  replace the server's tags instead of duplicating them.
// ═══════════════════════════════════════════════════════════════════════════

import {
  SITE_URL, ROUTES, DEFAULT_IMAGE, jsonLd, isoDate, splitList,
  websiteLD, profilePageLD, breadcrumbLD, blogPostingLD, faqLD,
} from './shared/render.js';

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (value == null) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

/** Inject or replace a JSON-LD block by id (ids match the worker's). */
export function injectSchema(id, schema) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = jsonLd(schema);
}

export const removeSchema = id => document.getElementById(id)?.remove();
const PAGE_SCHEMAS = ['dyn-schema', 'faq-schema', 'bc-schema', 'ld-profile', 'ld-blog'];
export const removeSchemas = (ids = PAGE_SCHEMAS) => ids.forEach(removeSchema);

/**
 * Update <head> for a route.
 * @param {object} o
 * @param {string}  o.path            canonical path (+ query for paginated lists)
 * @param {string} [o.title]          full <title>; defaults to ROUTES[path].title
 * @param {string} [o.desc]
 * @param {string} [o.image]          absolute image URL (post cover)
 * @param {boolean}[o.noindex]
 * @param {object} [o.post]           blog row → BlogPosting + article meta
 * @param {Array}  [o.faq]            [{q, a}] → FAQPage
 * @param {Array}  [o.crumbs]         [{name, url}] after Home
 */
export function updateSEO({ path = '/', title, desc, image, noindex = false, post, faq, crumbs } = {}) {
  const route = ROUTES[path.split('?')[0]] || {};
  const fullTitle = title || route.title || ROUTES['/'].title;
  const description = desc || route.description || ROUTES['/'].description;
  const canonical = SITE_URL + path;

  document.title = fullTitle;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
  document.getElementById('canonical')?.setAttribute('href', canonical);

  setMeta('property', 'og:title', fullTitle);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:type', post ? 'article' : 'website');
  setMeta('property', 'og:image', image || DEFAULT_IMAGE);
  setMeta('property', 'og:image:width', image ? null : '512');
  setMeta('property', 'og:image:height', image ? null : '512');
  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', fullTitle);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image || DEFAULT_IMAGE);

  const published = post && isoDate(post.Date);
  setMeta('property', 'article:published_time', published || null);
  setMeta('property', 'article:modified_time', post ? (isoDate(post.Last_Modified) || published || null) : null);
  setMeta('property', 'article:author', post ? 'Suman Dangal' : null);
  document.head.querySelectorAll('meta[property="article:tag"]').forEach(m => m.remove());
  if (post) splitList(post.Tags).forEach(t => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'article:tag');
    m.setAttribute('content', t);
    document.head.appendChild(m);
  });

  removeSchemas();
  injectSchema('ld-website', websiteLD());
  if (path === '/') injectSchema('ld-profile', profilePageLD());
  if (!noindex && path !== '/' && crumbs?.length) {
    injectSchema('bc-schema', breadcrumbLD([{ name: 'Home', url: `${SITE_URL}/` }, ...crumbs]));
  }
  if (post) injectSchema('dyn-schema', blogPostingLD(post));
  if (faq?.length) injectSchema('faq-schema', faqLD(faq));
}
