/**
 * js/views/about.js — About bio paragraphs.
 * Markup: aboutHTML(aboutParas(rows)) from js/shared/render.js.
 * First load keeps the server-rendered DOM.
 */

import { fetchSheet, CFG } from '../api.js';
import { loadCSS, watchReveals, takeSSR } from '../utils.js';
import { aboutHTML, aboutParas } from '../shared/render.js';

const CSS_LOADED = loadCSS('/css/about.css');

const FALLBACK_PARAS = [
  `I'm a final-year BCA student at Tribhuvan University, Nepal, passionate about building reliable software and catching bugs before users do.`,
  `I have hands-on experience across the full stack — from Django REST APIs and PHP backends to Android mobile apps.`,
  `I bring a testing mindset to everything I build — writing edge-case test suites, validating data across all operations, and ensuring frontend and backend always agree.`,
  `Looking for a Dev or QA Internship where I can grow fast, ship real features, and work with a team that cares about quality.`,
];

const render = (el, rows) => {
  const paras = aboutParas(rows);
  el.innerHTML = aboutHTML(paras.length ? paras : FALLBACK_PARAS);
};

export async function renderAbout() {
  await CSS_LOADED;
  const el = document.getElementById('aboutText');
  if (!el || takeSSR(el, '/about')) return;

  el.innerHTML = '<div class="skel skel-line" style="margin-bottom:1rem"></div>'.repeat(4);
  const rows = await fetchSheet(CFG.api.about, 'about', fresh => {
    if (document.getElementById('view-about')?.classList.contains('active')) {
      render(el, fresh);
      watchReveals();
    }
  });
  render(el, rows);
}
