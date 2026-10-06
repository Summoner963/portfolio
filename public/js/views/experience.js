/**
 * js/views/experience.js — Experience timeline.
 * Markup: timelineHTML() from js/shared/render.js (the worker renders the same).
 * First load keeps the server-rendered DOM; the built-in fallback is shown
 * only if the Sheet is unavailable and nothing was server-rendered.
 */

import { fetchSheet, CFG } from '../api.js';
import { loadCSS, watchReveals, takeSSR } from '../utils.js';
import { timelineHTML } from '../shared/render.js';

const CSS_LOADED = loadCSS('/css/about.css');

const FALLBACK_HTML =
  `<div class="tl-item reveal">` +
    `<div class="tl-dot" aria-hidden="true"></div>` +
    `<time class="tl-date" datetime="2025-09">SEP 2025 – DEC 2025</time>` +
    `<h3 class="tl-role">SEO Intern</h3>` +
    `<div class="tl-org">Sathi Edtech Pvt. Ltd. · Kathmandu</div>` +
    `<ul class="tl-list">` +
      `<li>Monitored traffic with Google Search Console; produced keyword reports</li>` +
      `<li>Corrected metadata errors, improving crawl efficiency</li>` +
      `<li>Optimized 10+ blog posts with high-ranking keywords</li>` +
    `</ul>` +
  `</div>` +

  `<div class="tl-item reveal">` +
    `<div class="tl-dot" aria-hidden="true"></div>` +
    `<time class="tl-date" datetime="2026-01">JAN 2026</time>` +
    `<h3 class="tl-role">Data Validation &amp; Testing</h3>` +
    `<div class="tl-org">Personal Project · Django E-commerce Platform</div>` +
    `<ul class="tl-list">` +
      `<li>Verified pricing, inventory, and user data across all CRUD ops</li>` +
      `<li>Wrote test cases covering edge cases and error-handling routines</li>` +
      `<li>Resolved 100% of data discrepancies found during testing</li>` +
    `</ul>` +
  `</div>` +

  `<div class="tl-item reveal">` +
    `<div class="tl-dot" aria-hidden="true"></div>` +
    `<time class="tl-date" datetime="2023-01">JAN 2023</time>` +
    `<h3 class="tl-role">System Logic Testing</h3>` +
    `<div class="tl-org">Personal Project · PHP College Library System</div>` +
    `<ul class="tl-list">` +
      `<li>Manual testing on library database logic</li>` +
      `<li>100% accuracy in book-to-student mapping</li>` +
      `<li>Resolved edge-case bugs using PHP OOP</li>` +
    `</ul>` +
  `</div>`;

export async function renderExperience() {
  await CSS_LOADED;
  const el = document.getElementById('expTimeline');
  if (!el || takeSSR(el, '/experience')) return;

  el.innerHTML = '<div class="skel skel-card"></div>'.repeat(3);
  const rows = await fetchSheet(CFG.api.exp, 'exp', fresh => {
    if (fresh?.length && document.getElementById('view-experience')?.classList.contains('active')) {
      el.innerHTML = timelineHTML(fresh);
      watchReveals();
    }
  });
  el.innerHTML = rows?.length ? timelineHTML(rows) : FALLBACK_HTML;
}
