/**
 * js/views/home.js
 *
 * Renders the home view:
 *  1. Patches the hero CTA buttons (adds "Chord Sheets ♪" ghost button)
 *  2. Fetches featured slugs + all blog rows in parallel
 *  3. Calls setBlogRows() so /blog never double-fetches
 *  4. Renders featured post cards into #featuredGrid
 *  5. Injects Person + Organization + WebSite JSON-LD via buildHomeSchemas()
 *  6. Cleans prior route schemas with removeSchemas() before injecting
 *
 * Exports: renderHome()
 *
 * Dependencies (all already built):
 *  - js/api.js       → fetchSheet, CFG
 *  - js/seo.js       → buildHomeSchemas, removeSchemas
 *  - js/utils.js     → esc, fixImgUrl, loadCSS, watchReveals, showToast
 *  - js/views/blog.js → setBlogRows
 */

import { fetchSheet, CFG }            from '../api.js';
import { buildHomeSchemas, removeSchemas } from '../seo.js';
import { esc, fixImgUrl, loadCSS, watchReveals } from '../utils.js';
import { setBlogRows }                from './blog.js';

// ── Lazy-load featured CSS once ───────────────────────────────────────────
let _cssLoaded = false;
async function ensureCSS() {
  if (_cssLoaded) return;
  await loadCSS('/css/featured.css');
  _cssLoaded = true;
}

// ── Hero CTA patch ────────────────────────────────────────────────────────
// index.html ships with one CTA: "View Projects ↓"
// We add a "Chord Sheets ♪" ghost button next to it.
// Guard against double-injection across same-session navigations.
let _heroPatched = false;
function patchHeroCTAs() {
  if (_heroPatched) return;
  const ctas = document.querySelector('.hero-ctas');
  if (!ctas) return;

  // Only add if the button doesn't already exist
  if (ctas.querySelector('[data-chord-cta]')) {
    _heroPatched = true;
    return;
  }

  const btn = document.createElement('a');
  btn.href            = '/chords';
  btn.className       = 'btn btn-ghost';
  btn.setAttribute('data-link', '');
  btn.setAttribute('data-chord-cta', '');
  btn.setAttribute('aria-label', 'Browse chord sheets');
  btn.textContent     = 'Chord Sheets ♪';

  // Insert after the first button
  const first = ctas.querySelector('.btn');
  if (first && first.nextSibling) {
    ctas.insertBefore(btn, first.nextSibling);
  } else {
    ctas.appendChild(btn);
  }

  _heroPatched = true;
}

// ── Featured posts renderer ───────────────────────────────────────────────
/**
 * Fetches featured slugs + blog rows in parallel, builds cards,
 * pre-populates the blog module cache via setBlogRows(), and reveals
 * the featured section. Silently fails on any error — section stays hidden.
 */
async function renderFeaturedPosts() {
  const section = document.getElementById('featuredSection');
  const grid    = document.getElementById('featuredGrid');
  if (!section || !grid) return;

  try {
    await ensureCSS();

    // Both fetches in parallel — fastest possible load
    const [featuredRows, allBlogRows] = await Promise.all([
      fetchSheet(CFG.api.featured, 'featured'),
      fetchSheet(CFG.api.blog,     'blog',
        // onRevalidate: if stale-while-revalidate fires a fresh blog fetch,
        // update the blog module's cache so the list page stays fresh
        fresh => setBlogRows(fresh)
      ),
    ]);

    // Pre-populate blog module cache so /blog won't re-fetch
    if (allBlogRows?.length) setBlogRows(allBlogRows);

    // Nothing configured → keep section hidden, silent exit
    if (!featuredRows?.length || !allBlogRows?.length) return;

    // Build slug → post lookup map
    const blogMap = Object.create(null);
    allBlogRows.forEach(p => {
      const slug = (p.Slug || '').trim();
      if (slug) blogMap[slug] = p;
    });

    // Resolve featured slugs → post objects (order preserved from featured sheet)
    const posts = featuredRows
      .map(r => {
        // Column header is "Slug"; fall back to first value for flexibility
        const slug = (r.Slug || r.slug || Object.values(r)[0] || '').trim();
        return slug ? blogMap[slug] : null;
      })
      .filter(Boolean);

    if (!posts.length) return;

    // Build cards
    const frag = document.createDocumentFragment();

    posts.forEach(post => {
      const slug   = (post.Slug || '').trim();
      const imgUrl = fixImgUrl(post.Image_URL || '');

      const card = document.createElement('article');
      card.className = 'fp-card reveal';
      card.setAttribute('role',      'listitem');
      card.setAttribute('tabindex',  '0');
      card.setAttribute('aria-label', esc(post.Title || 'Featured post'));

      // Thumbnail — 16:9, lazy loaded, falls back to emoji
      const thumbEl = document.createElement('div');
      thumbEl.className = 'fp-thumb';
      if (imgUrl) {
        const img = document.createElement('img');
        img.src     = imgUrl;
        img.alt     = post.Image_Alt || `${post.Title || 'Featured post'} cover image`;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width   = 400;
        img.height  = 225;
        thumbEl.appendChild(img);
      } else {
        thumbEl.setAttribute('aria-hidden', 'true');
        thumbEl.textContent = '✍️';
      }

      // Card body — use innerHTML only for already-escaped content
      const body = document.createElement('div');
      body.className = 'fp-body';
      body.innerHTML =
        `<div class="fp-meta">` +
          `<span class="fp-cat">${esc(post.Category || 'Post')}</span>` +
          `<time datetime="${esc(post.Date || '')}">${esc(post.Date || '')}</time>` +
        `</div>` +
        `<h3 class="fp-title">${esc(post.Title || '')}</h3>` +
        (post.Excerpt
          ? `<p class="fp-excerpt">${esc(post.Excerpt)}</p>`
          : '') +
        `<span class="fp-arrow" aria-hidden="true">Read post →</span>`;

      card.appendChild(thumbEl);
      card.appendChild(body);

      // Navigation — click + keyboard (Enter / Space)
      const go = () => {
        // Lazy-import navigate to avoid circular dependency
        import('../router.js').then(({ navigate }) => navigate(`/blog/${slug}`));
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });

      frag.appendChild(card);
    });

    // Swap skeletons → real cards, then reveal section
    grid.innerHTML = '';
    grid.appendChild(frag);
    section.setAttribute('aria-hidden', 'false');
    section.removeAttribute('aria-hidden'); // belt + suspenders

    watchReveals();

  } catch (err) {
    // Silent fail — section remains hidden, no blank screen, no console noise
    console.warn('[home] renderFeaturedPosts failed:', err.message);
  }
}

// ── Main export ───────────────────────────────────────────────────────────
/**
 * renderHome()
 *
 * Called by the router every time the user navigates to "/".
 * Safe to call multiple times in one session (all side effects are guarded).
 */
export async function renderHome() {
  // 1. Clean any JSON-LD schemas left by a previous route
  removeSchemas();

  // 2. Inject home-specific structured data (Person + Org + WebSite)
  buildHomeSchemas();

  // 3. Patch hero CTAs with Chord Sheets button
  patchHeroCTAs();

  // 4. Render featured posts (non-blocking — doesn't delay hero paint)
  //    Fire-and-forget; errors are caught internally.
  renderFeaturedPosts();

  // 5. Trigger reveal animations on any already-visible elements
  watchReveals();
}