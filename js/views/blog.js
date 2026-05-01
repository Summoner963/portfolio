/**
 * js/views/blog.js
 *
 * Handles BOTH the blog list view (#view-blog) and the single
 * article view (#view-article).
 *
 * Exports (all named):
 *   renderBlogList()       — called by main.js for /blog route
 *   renderArticle(slug)    — called by main.js for /blog/:slug route
 *   setBlogRows(rows)      — called by home.js so its parallel fetch
 *                            populates the module cache before /blog loads
 *   blogState              — { query, category, sort, page } object;
 *                            exposed so main.js can read/reset page from URL
 *   initBlogToolbar(rows)  — sets up search, chips, sort; called internally
 *                            but exported for future external use
 *   renderFilteredBlog()   — applies blogState filters and re-renders grid;
 *                            exported for future external use
 *   buildCategoryChips(rows) — builds filter chip row; exported for reuse
 *
 * Design decisions:
 *   - blogRows is module-scoped; both renderBlogList and renderArticle share it
 *   - Direct /blog/:slug navigation (no prior /blog visit) works: renderArticle
 *     fetches the sheet itself when blogRows is null
 *   - onRevalidate callback keeps the list live: if stale cache was shown,
 *     fresh data re-renders without a full navigation
 *   - All DOM manipulation uses createElement where practical; innerHTML only
 *     for already-escaped template strings
 *   - FAQ and image data are fetched in parallel with blog data in renderArticle
 *   - loadCSS('/css/blog.css') is awaited once; subsequent calls are no-ops
 *     (loadCSS guards double-injection internally)
 */

import { fetchSheet, CFG }              from '../api.js';
import { esc, md, fixImgUrl,
         sanitizeHTML, loadCSS,
         watchReveals, showToast }      from '../utils.js';
import { updateSEO, buildFAQ,
         buildImgMap, removeSchemas }   from '../seo.js';

// ── Module-level state ──────────────────────────────────────────────────────

/**
 * Cached blog rows shared between renderBlogList and renderArticle.
 * home.js can pre-populate this via setBlogRows() so the blog list
 * view never has to re-fetch data already loaded by the home page.
 * @type {Array<Object>|null}
 */
let blogRows = null;

/**
 * Live filter + sort + pagination state.
 * Exported so main.js can read `blogState.page` and inject the
 * page number from the URL query string before calling renderBlogList.
 */
export const blogState = {
  query:    '',
  category: 'all',
  sort:     'newest',
  page:     1,
};

/** Debounce timer handle for the search input */
let _searchTimer = null;

/** CSS load promise — cached so loadCSS is only awaited once */
let _cssPromise = null;

function ensureCSS() {
  if (!_cssPromise) _cssPromise = loadCSS('/css/blog.css');
  return _cssPromise;
}

// ── Public setter for home.js pre-population ────────────────────────────────

/**
 * Pre-populate the module cache from an external fetch (e.g. home.js
 * fetches blog + featured in parallel). Prevents a redundant network
 * request when the user navigates home → /blog.
 * @param {Array<Object>} rows
 */
export function setBlogRows(rows) {
  if (rows?.length) blogRows = rows;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a date string to a sortable timestamp.
 * Returns 0 for unparseable strings so those rows sort last.
 * @param {string} dateStr
 * @returns {number}
 */
function parseDateMs(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Apply current blogState (query/category/sort) to the full rows array
 * and return the filtered+sorted result. Does NOT paginate — caller slices.
 * @param {Array<Object>} rows
 * @returns {Array<Object>}
 */
function applyFilters(rows) {
  let result = [...rows];

  // Text search: title + excerpt + category + tags
  if (blogState.query) {
    const q = blogState.query.toLowerCase();
    result = result.filter(p =>
      (p.Title    || '').toLowerCase().includes(q) ||
      (p.Excerpt  || '').toLowerCase().includes(q) ||
      (p.Category || '').toLowerCase().includes(q) ||
      (p.Tags     || '').toLowerCase().includes(q)
    );
  }

  // Category filter
  if (blogState.category !== 'all') {
    const cat = blogState.category.toLowerCase();
    result = result.filter(p =>
      (p.Category || '').trim().toLowerCase() === cat
    );
  }

  // Sort
  switch (blogState.sort) {
    case 'newest': result.sort((a, b) => parseDateMs(b.Date) - parseDateMs(a.Date)); break;
    case 'oldest': result.sort((a, b) => parseDateMs(a.Date) - parseDateMs(b.Date)); break;
    case 'az':     result.sort((a, b) => (a.Title || '').localeCompare(b.Title || '')); break;
    case 'za':     result.sort((a, b) => (b.Title || '').localeCompare(a.Title || '')); break;
  }

  return result;
}

/**
 * Build a single blog card <article> element.
 * Uses createElement for the outer element; innerHTML only for the
 * already-escaped inner template string.
 * @param {Object} post
 * @returns {HTMLElement}
 */
function buildCard(post) {
  const imgUrl  = fixImgUrl(post.Image_URL || '');
  const tagList = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);

  const thumb = imgUrl
    ? `<div class="blog-card-thumb">
         <img src="${esc(imgUrl)}"
              alt="${esc(post.Image_Alt || (post.Title || '') + ' cover')}"
              loading="lazy" decoding="async"
              width="310" height="172">
       </div>`
    : `<div class="blog-card-thumb" aria-hidden="true">✍️</div>`;

  const tagsHTML = tagList.length
    ? `<div class="blog-card-tags">${
        tagList.map(t => `<span class="blog-tag">${esc(t)}</span>`).join('')
      }</div>`
    : '';

  const card = document.createElement('article');
  card.className = 'blog-card reveal';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'article');
  card.setAttribute('aria-label', esc(post.Title || 'Blog post'));

  card.innerHTML =
    thumb +
    `<div class="blog-card-body">` +
      `<div class="blog-card-meta">` +
        `<span class="blog-cat">${esc(post.Category || 'Post')}</span>` +
        `<time datetime="${esc(post.Date || '')}">${esc(post.Date || '')}</time>` +
      `</div>` +
      `<h3 class="blog-card-title">${esc(post.Title || '')}</h3>` +
      `<p class="blog-card-excerpt">${esc(post.Excerpt || '')}</p>` +
      tagsHTML +
    `</div>`;

  const slug = (post.Slug || '').trim();
  const go = () => {
    // Use router navigate via dynamic import to avoid circular dep.
    // navigate is re-imported lazily so the module graph stays acyclic.
    import('../router.js').then(({ navigate }) => navigate(`/blog/${slug}`));
  };
  card.addEventListener('click', go);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });

  return card;
}

/**
 * Build the pagination controls and inject them into #blogPagination.
 * @param {number} currentPage  1-based
 * @param {number} totalPages
 */
function renderPagination(currentPage, totalPages) {
  const nav = document.getElementById('blogPagination');
  if (!nav) return;
  nav.innerHTML = '';
  if (totalPages <= 1) return;

  if (currentPage > 1) {
    const prev = document.createElement('button');
    prev.className = 'btn btn-ghost';
    prev.setAttribute('aria-label', 'Previous page');
    prev.textContent = '← Prev';
    prev.addEventListener('click', () => {
      blogState.page = currentPage - 1;
      renderFilteredBlog();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    nav.appendChild(prev);
  }

  const info = document.createElement('span');
  info.setAttribute('aria-live', 'polite');
  info.setAttribute('aria-atomic', 'true');
  info.textContent = `Page ${currentPage} of ${totalPages}`;
  nav.appendChild(info);

  if (currentPage < totalPages) {
    const next = document.createElement('button');
    next.className = 'btn btn-ghost';
    next.setAttribute('aria-label', 'Next page');
    next.textContent = 'Next →';
    next.addEventListener('click', () => {
      blogState.page = currentPage + 1;
      renderFilteredBlog();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    nav.appendChild(next);
  }
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

/**
 * Build and wire the category filter chips row.
 * Clears the #blogFilters container first so repeated calls are safe.
 * @param {Array<Object>} rows
 */
export function buildCategoryChips(rows) {
  const container = document.getElementById('blogFilters');
  if (!container) return;

  // Collect unique categories preserving sheet order
  const seen = new Set();
  const cats = [];
  rows.forEach(r => {
    const c = (r.Category || '').trim();
    if (c && !seen.has(c)) { seen.add(c); cats.push(c); }
  });

  container.innerHTML = '';

  // "All" chip
  const allChip = document.createElement('button');
  allChip.className = 'filter-chip' + (blogState.category === 'all' ? ' active' : '');
  allChip.textContent = 'All';
  allChip.setAttribute('aria-pressed', String(blogState.category === 'all'));
  allChip.addEventListener('click', () => {
    blogState.category = 'all';
    blogState.page = 1;
    syncChipActive(container, 'all');
    renderFilteredBlog();
  });
  container.appendChild(allChip);

  // One chip per category
  cats.sort().forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (blogState.category === cat ? ' active' : '');
    chip.textContent = cat;
    chip.dataset.cat = cat;
    chip.setAttribute('aria-pressed', String(blogState.category === cat));
    chip.addEventListener('click', () => {
      blogState.category = cat;
      blogState.page = 1;
      syncChipActive(container, cat);
      renderFilteredBlog();
    });
    container.appendChild(chip);
  });
}

/** Update aria-pressed + .active class on all chips in a container. */
function syncChipActive(container, activeCat) {
  container.querySelectorAll('.filter-chip').forEach(chip => {
    const cat = chip.dataset.cat || 'all';
    const active = cat === activeCat;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

/**
 * Wire up the blog toolbar: show it, build chips, bind search + sort.
 * Clones search + sort nodes to strip any previous event listeners before
 * re-attaching, so calling initBlogToolbar more than once is safe.
 * @param {Array<Object>} rows
 */
export function initBlogToolbar(rows) {
  const toolbar = document.getElementById('blogToolbar');
  if (!toolbar) return;
  toolbar.style.display = '';

  buildCategoryChips(rows);

  // ── Search ──
  const oldSearch = document.getElementById('blogSearch');
  if (oldSearch) {
    const freshSearch = oldSearch.cloneNode(true);
    freshSearch.value = blogState.query;
    oldSearch.parentNode.replaceChild(freshSearch, oldSearch);
    freshSearch.addEventListener('input', e => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        blogState.query = e.target.value.trim();
        blogState.page  = 1;
        renderFilteredBlog();
      }, 260);
    });
  }

  // ── Sort ──
  const oldSort = document.getElementById('blogSort');
  if (oldSort) {
    const freshSort = oldSort.cloneNode(true);
    freshSort.value = blogState.sort;
    oldSort.parentNode.replaceChild(freshSort, oldSort);
    freshSort.addEventListener('change', e => {
      blogState.sort = e.target.value;
      blogState.page = 1;
      renderFilteredBlog();
    });
  }
}

// ── Core render functions ────────────────────────────────────────────────────

/**
 * Apply current blogState to blogRows and re-render the card grid +
 * pagination + results count. Safe to call repeatedly.
 * Requires blogRows to be non-null (called only after data is loaded).
 */
export function renderFilteredBlog() {
  if (!blogRows?.length) return;

  const grid     = document.getElementById('blogGrid');
  const countEl  = document.getElementById('blogResultsCount');
  if (!grid) return;

  const filtered   = applyFilters(blogRows);
  const perPage    = CFG.postsPerPage || 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage   = Math.max(1, Math.min(blogState.page, totalPages));
  const slice      = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  // Results count — only shown when a filter/search is active
  if (countEl) {
    const active = blogState.query || blogState.category !== 'all';
    countEl.textContent = active
      ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
      : '';
  }

  // Empty state
  if (!slice.length) {
    grid.innerHTML =
      '<p class="empty-state">No posts match your search — try different keywords or filters.</p>';
    renderPagination(1, 0);
    return;
  }

  // Build card fragment
  const frag = document.createDocumentFragment();
  slice.forEach(post => frag.appendChild(buildCard(post)));

  grid.innerHTML = '';
  grid.appendChild(frag);

  renderPagination(safePage, totalPages);
  watchReveals();
}

/**
 * Entry point for the /blog route.
 * Fetches data (or reuses cache), wires toolbar, renders initial grid.
 * Handles revalidation: if stale cache was shown, onRevalidate re-renders
 * with fresh data without requiring a navigation.
 */
export async function renderBlogList() {
  await ensureCSS();

  const grid = document.getElementById('blogGrid');
  if (!grid) return;

  // Show skeleton while loading
  if (!blogRows) {
    grid.innerHTML = '<div class="skel skel-card"></div>'.repeat(3);
    const toolbar = document.getElementById('blogToolbar');
    if (toolbar) toolbar.style.display = 'none';
  }

  blogRows = await fetchSheet(
    CFG.api.blog,
    'blog',
    fresh => {
      // Revalidation callback: update cache and re-render if blog view is active
      blogRows = fresh;
      const view = document.getElementById('view-blog');
      if (view?.classList.contains('active')) {
        initBlogToolbar(fresh);
        renderFilteredBlog();
      }
    }
  );

  if (!blogRows?.length) {
    const toolbar = document.getElementById('blogToolbar');
    if (toolbar) toolbar.style.display = 'none';
    if (grid) {
      grid.innerHTML =
        '<p class="empty-state">No posts yet — check back soon.</p>';
    }
    return;
  }

  initBlogToolbar(blogRows);
  renderFilteredBlog();
}

// ── Article view ─────────────────────────────────────────────────────────────

/**
 * Entry point for the /blog/:slug route.
 * Fetches blog data (reuses cache if available), renders full article with
 * cover image, body markdown, FAQ accordion, author byline, structured data.
 * @param {string} slug
 */
export async function renderArticle(slug) {
  await ensureCSS();

  const wrap = document.getElementById('articleWrap');
  if (!wrap) return;

  // Skeleton while loading
  wrap.innerHTML =
    `<div class="skel skel-line m" style="margin-bottom:1.5rem"></div>` +
    `<div class="skel skel-line" style="height:36px;margin-bottom:1.5rem"></div>` +
    `<div class="skel skel-card" style="height:320px;margin-bottom:1.5rem"></div>` +
    `<div class="skel skel-line"></div>` +
    `<div class="skel skel-line m"></div>` +
    `<div class="skel skel-line s"></div>`;

  // Fetch blog, FAQ and image data in parallel.
  // If blogRows already populated (from cache or home.js pre-fetch), skip refetch.
  const [freshBlog, faqData, imageData] = await Promise.all([
    blogRows
      ? Promise.resolve(blogRows)
      : fetchSheet(CFG.api.blog, 'blog'),
    fetchSheet(CFG.api.faq,    'faq'),
    fetchSheet(CFG.api.images, 'images'),
  ]);

  // Populate module cache if this was the first fetch
  if (!blogRows && freshBlog?.length) blogRows = freshBlog;

  const post = blogRows?.find(p => (p.Slug || '').trim() === slug);

  // ── 404 ──────────────────────────────────────────────────────────────────
  if (!post) {
    removeSchemas();
    updateSEO({
      title: `${slug} — Not Found`,
      desc:  'Blog post not found.',
      path:  `/blog/${slug}`,
    });

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'article-back';
    backBtn.textContent = '← Back to Blog';
    backBtn.addEventListener('click', () => {
      import('../router.js').then(({ navigate }) => navigate('/blog'));
    });

    const notFound = document.createElement('div');
    notFound.className = 'not-found-wrap';
    notFound.innerHTML =
      `<span class="not-found-code" aria-hidden="true">404</span>` +
      `<h2>Post not found</h2>` +
      `<p>No post with slug <code style="font-family:var(--mono);color:var(--accent)">${esc(slug)}</code> exists.</p>`;

    const homeLink = document.createElement('a');
    homeLink.className = 'btn btn-solid';
    homeLink.setAttribute('data-link', '');
    homeLink.setAttribute('href', '/blog');
    homeLink.textContent = '← Browse all posts';
    notFound.appendChild(homeLink);

    wrap.innerHTML = '';
    wrap.appendChild(backBtn);
    wrap.appendChild(notFound);
    return;
  }

  // ── Build article ─────────────────────────────────────────────────────────
  const coverUrl  = fixImgUrl(post.Image_URL || '');
  const tagList   = (post.Tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const imgMap    = buildImgMap(post, imageData);

  // Update SEO + structured data (also injects BlogPosting + BreadcrumbList)
  removeSchemas();
  updateSEO({
    title:       post.Title || '',
    desc:        post.Excerpt || '',
    path:        `/blog/${slug}`,
    ogImage:     coverUrl,
    articleMeta: {
      title:    post.Title    || '',
      excerpt:  post.Excerpt  || '',
      date:     post.Date     || '',
      imageUrl: coverUrl,
      tags:     tagList,
    },
  });

  // Build FAQ HTML + inject FAQPage schema
  const faqHTML = await buildFAQ(slug, faqData);

  // ── Tags row ──
  const tagsHTML = tagList.length
    ? `<div class="article-tags">${
        tagList.map(t => `<span class="article-tag">${esc(t)}</span>`).join('')
      }</div>`
    : '';

  // ── Cover image ──
  const coverHTML = coverUrl
    ? `<img class="article-cover"
           src="${esc(coverUrl)}"
           alt="${esc(post.Image_Alt || (post.Title || '') + ' featured image')}"
           loading="eager" decoding="async" fetchpriority="high"
           width="720" height="420">`
    : '';

  // ── Table HTML (optional sanitized block from sheet) ──
  const tableHTML = post.Table_HTML
    ? `<div class="sheet-html-block">${sanitizeHTML(post.Table_HTML)}</div>`
    : '';

  // ── Article body ──
  const bodyHTML = md(post.Content || '', imgMap);

  // ── Author byline ──
  const authorHTML =
    `<div class="article-author" itemscope itemtype="https://schema.org/Person">` +
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.5" aria-hidden="true">
         <circle cx="12" cy="8" r="4"/>
         <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
       </svg>` +
      `<span>Written by <a href="/about" data-link itemprop="url">` +
        `<span itemprop="name">Suman Dangal</span></a>` +
      `</span>` +
    `</div>`;

  // ── Assemble wrap ──────────────────────────────────────────────────────────
  wrap.innerHTML = '';

  // Back button (built with createElement so event listener works without data-link)
  const backBtn = document.createElement('button');
  backBtn.className = 'article-back';
  backBtn.setAttribute('aria-label', 'Back to blog list');
  backBtn.textContent = '← Back to Blog';
  backBtn.addEventListener('click', () => {
    import('../router.js').then(({ navigate }) => navigate('/blog'));
  });
  wrap.appendChild(backBtn);

  // The rest of the article is trusted escaped HTML
  const articleContent = document.createElement('div');
  articleContent.innerHTML =
    `<div class="article-meta">` +
      `<span class="blog-cat">${esc(post.Category || 'Post')}</span>` +
      `<time datetime="${esc(post.Date || '')}">${esc(post.Date || '')}</time>` +
    `</div>` +
    `<h2 class="article-title">${esc(post.Title || '')}</h2>` +
    tagsHTML +
    coverHTML +
    `<div class="article-body">${bodyHTML}${tableHTML}</div>` +
    authorHTML +
    faqHTML;

  wrap.appendChild(articleContent);
  watchReveals();
}