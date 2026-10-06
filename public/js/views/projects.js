/**
 * js/views/projects.js — Projects view.
 * Markup: projectsHTML() from js/shared/render.js (the worker renders the same).
 * First load keeps the server-rendered DOM; the built-in fallback is shown
 * only if the Sheet is unavailable and nothing was server-rendered.
 */

import { fetchSheet, CFG } from '../api.js';
import { loadCSS, watchReveals, takeSSR } from '../utils.js';
import { projectsHTML } from '../shared/render.js';

const CSS_LOADED = loadCSS('/css/projects.css');

const FALLBACK_HTML =
  `<article class="proj-card feat reveal">` +
    `<div>` +
      `<div class="proj-num">01 / Featured</div>` +
      `<h3 class="proj-title">Django E-commerce Platform</h3>` +
      `<p class="proj-desc">Full-stack product listing, cart, and checkout using Django's MVT architecture.</p>` +
      `<ul class="proj-bullets">` +
        `<li>Verified 100% of CRUD operations across relational SQLite database</li>` +
        `<li>Wrote edge-case &amp; error-handling test suites; prevented SQL injection</li>` +
        `<li>Resolved all frontend-to-backend data discrepancies found in testing</li>` +
      `</ul>` +
      `<div class="proj-stack">` +
        `<span class="tag">Django</span>` +
        `<span class="tag">Python</span>` +
        `<span class="tag">SQLite</span>` +
        `<span class="tag">Django REST</span>` +
        `<span class="tag">Manual Testing</span>` +
      `</div>` +
      `<p class="proj-note">⚠️ ~60s cold start on free Render hosting</p>` +
      `<div class="proj-links">` +
        `<a href="https://ecommerce-ksmw.onrender.com/" class="btn btn-solid"` +
           ` target="_blank" rel="noopener noreferrer">View Project ↗</a>` +
      `</div>` +
    `</div>` +
    `<div class="proj-visual" aria-hidden="true">🛒</div>` +
  `</article>` +

  `<article class="proj-card reveal">` +
    `<div class="proj-num">02</div>` +
    `<h3 class="proj-title">College Library Management System</h3>` +
    `<p class="proj-desc">PHP OOP application managing book inventory and student borrowing records.</p>` +
    `<ul class="proj-bullets">` +
      `<li>100% accuracy in book-to-student mapping</li>` +
      `<li>Resolved edge-case bugs in borrow/return logic</li>` +
      `<li>SQL-safe input handling throughout</li>` +
    `</ul>` +
    `<div class="proj-stack">` +
      `<span class="tag">PHP</span>` +
      `<span class="tag">MariaDB</span>` +
      `<span class="tag">MySQL</span>` +
      `<span class="tag">OOP</span>` +
    `</div>` +
    `<div class="proj-links">` +
      `<a href="https://collglibsys.free.nf/" class="btn btn-solid"` +
         ` target="_blank" rel="noopener noreferrer">View Project ↗</a>` +
    `</div>` +
  `</article>` +

  `<article class="proj-card reveal">` +
    `<div class="proj-num">03</div>` +
    `<h3 class="proj-title">Bluetooth Messaging App</h3>` +
    `<p class="proj-desc">Android app enabling peer-to-peer Bluetooth messaging with local data persistence.</p>` +
    `<ul class="proj-bullets">` +
      `<li>Tested connectivity across multiple device combos</li>` +
      `<li>Resolved stability issues for consistent delivery</li>` +
    `</ul>` +
    `<div class="proj-stack">` +
      `<span class="tag">Java</span>` +
      `<span class="tag">Android Studio</span>` +
      `<span class="tag">Bluetooth API</span>` +
      `<span class="tag">XML</span>` +
    `</div>` +
  `</article>` +

  `<article class="proj-card wide reveal">` +
    `<div class="proj-num">04</div>` +
    `<h3 class="proj-title">Book E-commerce Platform</h3>` +
    `<p class="proj-desc">Full-stack PHP app with authentication, product management, sandbox payment, and order tracking.</p>` +
    `<div class="proj-stack">` +
      `<span class="tag">PHP</span>` +
      `<span class="tag">MariaDB</span>` +
      `<span class="tag">HTML</span>` +
      `<span class="tag">CSS</span>` +
      `<span class="tag">JavaScript</span>` +
      `<span class="tag">Authentication</span>` +
    `</div>` +
    `<div class="proj-links">` +
      `<a href="https://bookecom.free.nf/" class="btn btn-solid"` +
         ` target="_blank" rel="noopener noreferrer">View Project ↗</a>` +
    `</div>` +
  `</article>`;

export async function renderProjects() {
  await CSS_LOADED;
  const el = document.getElementById('projectsGrid');
  if (!el || takeSSR(el, '/projects')) return;

  el.innerHTML = '<div class="skel skel-card"></div>'.repeat(4);
  const rows = await fetchSheet(CFG.api.projects, 'projects', fresh => {
    if (fresh?.length && document.getElementById('view-projects')?.classList.contains('active')) {
      el.innerHTML = projectsHTML(fresh);
      watchReveals();
    }
  });
  el.innerHTML = rows?.length ? projectsHTML(rows) : FALLBACK_HTML;
}
