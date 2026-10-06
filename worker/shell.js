// worker/shell.js
// Turns public/index.html into a route-specific page with HTMLRewriter.
// Head elements are replaced wholesale (not setAttribute) so all escaping is
// done by esc()/jsonLd() from the shared module.

import { esc, jsonLd, DEFAULT_IMAGE } from '../public/js/shared/render.js';

/**
 * @param {object} page
 *   title, description, canonical, robots?, type?, image?, css[], jsonLd{id: obj},
 *   extraHead?, view?, heading? ('section' | 'none'), inject{selector: html},
 *   ssrRoute?, notFound? (html for #heroSection overlay)
 */
export function rewriteShell(page) {
  const image  = page.image || DEFAULT_IMAGE;
  const robots = page.robots || 'index, follow';
  const swap = html => ({ element(el) { el.replace(html, { html: true }); } });
  const remove = { element(el) { el.remove(); } };

  const rw = new HTMLRewriter()
    .on('title',                             swap(`<title>${esc(page.title)}</title>`))
    .on('meta[name="description"]',          swap(`<meta name="description" content="${esc(page.description)}" />`))
    .on('meta[name="robots"]',               swap(`<meta name="robots" content="${esc(robots)}" />`))
    .on('link[rel="canonical"]',             swap(`<link id="canonical" rel="canonical" href="${esc(page.canonical)}" />`))
    .on('meta[property="og:type"]',          swap(`<meta property="og:type" content="${page.type || 'website'}" />`))
    .on('meta[property="og:title"]',         swap(`<meta property="og:title" content="${esc(page.title)}" />`))
    .on('meta[property="og:description"]',   swap(`<meta property="og:description" content="${esc(page.description)}" />`))
    .on('meta[property="og:url"]',           swap(`<meta property="og:url" content="${esc(page.canonical)}" />`))
    .on('meta[property="og:image"]',         swap(`<meta property="og:image" content="${esc(image)}" />`))
    .on('meta[name="twitter:card"]',         swap(`<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}" />`))
    .on('meta[name="twitter:title"]',        swap(`<meta name="twitter:title" content="${esc(page.title)}" />`))
    .on('meta[name="twitter:description"]',  swap(`<meta name="twitter:description" content="${esc(page.description)}" />`))
    .on('meta[name="twitter:image"]',        swap(`<meta name="twitter:image" content="${esc(image)}" />`))
    .on('head', { element(el) {
      el.append(
        (page.css || []).map(href => `<link rel="stylesheet" href="${esc(href)}" />`).join('') +
        (page.extraHead || '') +
        Object.entries(page.jsonLd || {})
          .map(([id, obj]) => `<script type="application/ld+json" id="${esc(id)}">${jsonLd(obj)}</script>`).join(''),
        { html: true });
    } });

  // Post covers have unknown dimensions; the 512×512 hints describe the default image only
  if (page.image) {
    rw.on('meta[property="og:image:width"]', remove).on('meta[property="og:image:height"]', remove);
  }

  if (page.view) {
    rw.on(`#view-${page.view}`, { element(el) { el.setAttribute('class', `${el.getAttribute('class') || ''} active`.trim()); } });
  }
  // One H1 per page. heading: 'hero' (home) | 'section' (view heading) |
  // 'article' (H1 inside the post) | 'none' (404 overlay / admin)
  if (page.heading !== 'hero') rw.on('#site-h1', { element(el) { el.tagName = 'h2'; } });
  if (page.view && page.heading === 'section') {
    rw.on(`#view-${page.view} .section-heading`, { element(el) { el.tagName = 'h1'; } });
  }

  for (const [selector, html] of Object.entries(page.inject || {})) {
    rw.on(selector, { element(el) {
      el.setInnerContent(html, { html: true });
      if (page.ssrRoute) el.setAttribute('data-ssr', page.ssrRoute);
    } });
  }
  if (page.showFeatured) rw.on('#featuredSection', { element(el) { el.removeAttribute('aria-hidden'); } });
  if (page.notFound) rw.on('#heroSection', { element(el) {
    el.append(`<div id="spa-404-overlay">${page.notFound}</div>`, { html: true });
  } });
  return rw;
}
