/**
 * js/views/blog.js — blog list (#view-blog) and single article (#view-article).
 *
 * Markup comes from js/shared/render.js (the worker renders the same HTML),
 * cards and pagination are real <a href> links, and on the first page load
 * the server-rendered DOM is kept (takeSSR) instead of being re-rendered.
 *
 * Exports: renderBlogList(page), renderArticle(slug), setBlogRows(rows),
 *          blogState, initBlogToolbar(rows), renderFilteredBlog()
 */

import { fetchSheet, CFG } from '../api.js';
import { sanitizeHTML, loadCSS, watchReveals, takeSSR } from '../utils.js';
import { updateSEO } from '../seo.js';
import {
  SITE_URL, POSTS_PER_PAGE, dateValue, blogCardHTML, paginationHTML,
  articleHTML, notFoundHTML, faqPairs, fixImgUrl, plainExcerpt, pageTitle,
} from '../shared/render.js';

/** Blog rows shared by list + article (home.js pre-fills via setBlogRows). */
let blogRows = null;

/** Live filter/sort/page state (page comes from ?page= in the URL). */
export const blogState = { query: '', category: 'all', sort: 'newest', page: 1 };

let _searchTimer = null;
/** URL this page was loaded at — the server already rendered (or 404'd) it. */
const INITIAL_PATH = location.pathname;
const ensureCSS = () => loadCSS('/css/blog.css');

export function setBlogRows(rows) {
  if (rows?.length) blogRows = rows;
}

function applyFilters(rows) {
  let result = [...rows];
  if (blogState.query) {
    const q = blogState.query.toLowerCase();
    result = result.filter(p => ['Title', 'Excerpt', 'Category', 'Tags']
      .some(k => (p[k] || '').toLowerCase().includes(q)));
  }
  if (blogState.category !== 'all') {
    const cat = blogState.category.toLowerCase();
    result = result.filter(p => (p.Category || '').trim().toLowerCase() === cat);
  }
  switch (blogState.sort) {
    case 'newest': result.sort((a, b) => dateValue(b.Date) - dateValue(a.Date)); break;
    case 'oldest': result.sort((a, b) => dateValue(a.Date) - dateValue(b.Date)); break;
    case 'az':     result.sort((a, b) => (a.Title || '').localeCompare(b.Title || '')); break;
    case 'za':     result.sort((a, b) => (b.Title || '').localeCompare(a.Title || '')); break;
  }
  return result;
}

// ── Toolbar ──────────────────────────────────────────────────────────────

function syncChipActive(container, activeCat) {
  container.querySelectorAll('.filter-chip').forEach(chip => {
    const active = (chip.dataset.cat || 'all') === activeCat;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function chip(label, cat, container) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'filter-chip' + (blogState.category === cat ? ' active' : '');
  b.textContent = label;
  if (cat !== 'all') b.dataset.cat = cat;
  b.setAttribute('aria-pressed', String(blogState.category === cat));
  b.addEventListener('click', () => {
    blogState.category = cat;
    blogState.page = 1;
    syncChipActive(container, cat);
    renderFilteredBlog();
  });
  return b;
}

export function buildCategoryChips(rows) {
  const container = document.getElementById('blogFilters');
  if (!container) return;
  const cats = [...new Set(rows.map(r => (r.Category || '').trim()).filter(Boolean))].sort();
  container.innerHTML = '';
  container.appendChild(chip('All', 'all', container));
  cats.forEach(c => container.appendChild(chip(c, c, container)));
}

/** Show + wire search, chips and sort. Safe to call repeatedly. */
export function initBlogToolbar(rows) {
  const toolbar = document.getElementById('blogToolbar');
  if (!toolbar) return;
  toolbar.style.display = '';
  buildCategoryChips(rows);

  const oldSearch = document.getElementById('blogSearch');
  if (oldSearch) {
    const search = oldSearch.cloneNode(true); // drops previous listeners
    search.value = blogState.query;
    oldSearch.replaceWith(search);
    search.addEventListener('input', e => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        blogState.query = e.target.value.trim();
        blogState.page = 1;
        renderFilteredBlog();
      }, 260);
    });
  }
  const oldSort = document.getElementById('blogSort');
  if (oldSort) {
    const sort = oldSort.cloneNode(true);
    sort.value = blogState.sort;
    oldSort.replaceWith(sort);
    sort.addEventListener('change', e => {
      blogState.sort = e.target.value;
      blogState.page = 1;
      renderFilteredBlog();
    });
  }
}

// ── List ─────────────────────────────────────────────────────────────────

/** Re-render grid + pagination + count from blogState. */
export function renderFilteredBlog() {
  const grid = document.getElementById('blogGrid');
  if (!grid || !blogRows?.length) return;
  const filtered = applyFilters(blogRows);
  const total = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE));
  const page = Math.max(1, Math.min(blogState.page, total));
  const slice = filtered.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);

  const count = document.getElementById('blogResultsCount');
  if (count) {
    count.textContent = (blogState.query || blogState.category !== 'all')
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : '';
  }
  grid.innerHTML = slice.length
    ? slice.map(p => blogCardHTML(p)).join('')
    : '<p class="empty-state">No posts match your search — try different keywords or filters.</p>';
  const nav = document.getElementById('blogPagination');
  if (nav) nav.innerHTML = slice.length ? paginationHTML(page, total) : '';
  watchReveals();
}

/** /blog and /blog?page=N */
export async function renderBlogList(page = 1) {
  await ensureCSS();
  const grid = document.getElementById('blogGrid');
  if (!grid) return;
  blogState.page = page;
  const key = page > 1 ? `/blog?page=${page}` : '/blog';
  const keepSSR = takeSSR(grid, key);
  takeSSR(document.getElementById('blogPagination'), key);

  if (!keepSSR && !blogRows) {
    grid.innerHTML = '<div class="skel skel-card"></div>'.repeat(3);
    const toolbar = document.getElementById('blogToolbar');
    if (toolbar) toolbar.style.display = 'none';
  }

  const rows = await fetchSheet(CFG.api.blog, 'blog', fresh => {
    blogRows = fresh;
    if (document.getElementById('view-blog')?.classList.contains('active')) {
      initBlogToolbar(fresh);
      renderFilteredBlog();
    }
  });
  if (rows?.length) blogRows = rows;

  if (!blogRows?.length) {
    if (keepSSR) return; // data unavailable: keep the server-rendered cards
    const toolbar = document.getElementById('blogToolbar');
    if (toolbar) toolbar.style.display = 'none';
    grid.innerHTML = '<p class="empty-state">No posts yet — check back soon.</p>';
    return;
  }
  initBlogToolbar(blogRows);
  if (!keepSSR) renderFilteredBlog(); // server cards already match this page
}

// ── Article ──────────────────────────────────────────────────────────────

/** /blog/:slug */
export async function renderArticle(slug) {
  await ensureCSS();
  const wrap = document.getElementById('articleWrap');
  if (!wrap) return;
  const path = `/blog/${slug}`;
  // First load: the worker rendered the article and its <head>; keep both.
  if (takeSSR(wrap, path)) return;

  wrap.innerHTML =
    `<div class="skel skel-line m" style="margin-bottom:1.5rem"></div>` +
    `<div class="skel skel-line" style="height:36px;margin-bottom:1.5rem"></div>` +
    `<div class="skel skel-card" style="height:320px;margin-bottom:1.5rem"></div>` +
    `<div class="skel skel-line"></div><div class="skel skel-line m"></div><div class="skel skel-line s"></div>`;

  const [fresh, faqRows, imageRows] = await Promise.all([
    blogRows ? Promise.resolve(blogRows) : fetchSheet(CFG.api.blog, 'blog'),
    fetchSheet(CFG.api.faq, 'faq'),
    fetchSheet(CFG.api.images, 'images'),
  ]);
  if (!blogRows && fresh?.length) blogRows = fresh;
  const post = blogRows?.find(p => (p.Slug || '').trim() === slug);

  if (!post && blogRows && path !== INITIAL_PATH) {
    // This browser's cached post list may be older than the server's (a post
    // published minutes ago). Load the URL from the server instead of
    // claiming 404; the server answers with the post or a real 404.
    location.assign(path);
    return;
  }
  if (!post) {
    updateSEO({ path, title: 'Page Not Found | Suman Dangal', desc: 'This page does not exist.', noindex: true });
    wrap.innerHTML = blogRows
      ? notFoundHTML(path, { article: true })
      : `<div class="not-found-wrap"><h1>Couldn't load this post</h1><p>Please check your connection and try again.</p></div>`;
    return;
  }

  const pairs = faqPairs(faqRows, post.Slug);
  wrap.innerHTML = articleHTML(post, {
    imageRows: imageRows || [], faqRows: faqRows || [],
    tableHTML: sanitizeHTML(post.Table_HTML), allPosts: blogRows,
  });
  updateSEO({
    path,
    title: pageTitle(post.Title),
    desc: post.Excerpt || plainExcerpt(post.Content),
    image: fixImgUrl(post.Image_URL) || undefined,
    post, faq: pairs,
    crumbs: [{ name: 'Blog', url: `${SITE_URL}/blog` }, { name: post.Title, url: SITE_URL + path }],
  });
  watchReveals();
}
