/**
 * js/views/home.js — home view: hero (static HTML) + featured posts.
 *
 * Featured cards come from js/shared/render.js (same markup the worker
 * renders). On the first load the server-rendered cards are kept.
 * JSON-LD for the home page is set by updateSEO() in main.js.
 *
 * Exports: renderHome()
 */

import { fetchSheet, CFG } from '../api.js';
import { loadCSS, watchReveals, takeSSR } from '../utils.js';
import { featuredCardHTML, featuredPosts } from '../shared/render.js';
import { setBlogRows } from './blog.js';

/** Fetch featured slugs + blog rows, render cards, reveal the section. */
async function renderFeaturedPosts() {
  const section = document.getElementById('featuredSection');
  const grid    = document.getElementById('featuredGrid');
  if (!section || !grid) return;

  try {
    await loadCSS('/css/featured.css');
    const keepSSR = takeSSR(grid, '/');

    const [featuredRows, allBlogRows] = await Promise.all([
      fetchSheet(CFG.api.featured, 'featured'),
      fetchSheet(CFG.api.blog, 'blog', fresh => setBlogRows(fresh)),
    ]);
    if (allBlogRows?.length) setBlogRows(allBlogRows); // /blog won't re-fetch
    if (keepSSR) return;

    const posts = featuredPosts(featuredRows, allBlogRows);
    if (!posts.length) return; // nothing configured: section stays hidden

    grid.innerHTML = posts.map(p => featuredCardHTML(p)).join('');
    section.removeAttribute('aria-hidden');
    watchReveals();
  } catch (err) {
    console.warn('[home] renderFeaturedPosts failed:', err.message);
  }
}

export async function renderHome() {
  renderFeaturedPosts(); // non-blocking: never delays the hero paint
  watchReveals();
}
