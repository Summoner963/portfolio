/**
 * js/views/contact.js — Contact view. Tiles and texts come from the Site tab
 * (filled by the worker); the FAQ comes from FAQ rows with Blog_Slug = contact.
 */
import { fetchSheet, CFG } from '../api.js';
import { loadCSS, watchReveals, takeSSR } from '../utils.js';
import { faqPairs, faqSectionHTML, faqLD } from '../shared/render.js';
import { injectSchema } from '../seo.js';

const CSS_LOADED = Promise.all([loadCSS('/css/about.css'), loadCSS('/css/blog.css')]); // blog.css: FAQ styles

export async function renderContact() {
  await CSS_LOADED;
  const el = document.getElementById('contactFaq');
  if (el && !takeSSR(el, '/contact')) {
    const pairs = faqPairs(await fetchSheet(CFG.api.faq, 'faq'), 'contact');
    el.innerHTML = faqSectionHTML(pairs);
    if (pairs.length) injectSchema('faq-schema', faqLD(pairs));
  }
  watchReveals();
}
