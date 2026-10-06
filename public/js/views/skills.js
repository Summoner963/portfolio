/**
 * js/views/skills.js — Skills view.
 * Markup: skillsHTML() from js/shared/render.js (the worker renders the same).
 * First load keeps the server-rendered DOM; the built-in fallback is shown
 * only if the Sheet is unavailable and nothing was server-rendered.
 */

import { fetchSheet, CFG } from '../api.js';
import { loadCSS, watchReveals, takeSSR } from '../utils.js';
import { skillsHTML } from '../shared/render.js';

const CSS_LOADED = loadCSS('/css/skills.css');

const FALLBACK_HTML =
  `<div class="skill-card c-green reveal">` +
    `<div class="skill-icon" aria-hidden="true">🐍</div>` +
    `<div class="skill-name">Languages</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Python</span>` +
      `<span class="tag">Java</span>` +
      `<span class="tag">PHP</span>` +
      `<span class="tag">JavaScript</span>` +
      `<span class="tag">HTML5</span>` +
      `<span class="tag">CSS3</span>` +
    `</div>` +
  `</div>` +
  `<div class="skill-card c-blue reveal">` +
    `<div class="skill-icon" aria-hidden="true">⚙️</div>` +
    `<div class="skill-name">Frameworks &amp; Backend</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Django</span>` +
      `<span class="tag">Django REST</span>` +
      `<span class="tag">PHP OOP</span>` +
      `<span class="tag">SQLite</span>` +
      `<span class="tag">MySQL</span>` +
      `<span class="tag">MariaDB</span>` +
    `</div>` +
  `</div>` +
  `<div class="skill-card c-amber reveal">` +
    `<div class="skill-icon" aria-hidden="true">📱</div>` +
    `<div class="skill-name">Mobile &amp; Tools</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Android Studio</span>` +
      `<span class="tag">Java (Android)</span>` +
      `<span class="tag">XML Layouts</span>` +
      `<span class="tag">Git</span>` +
      `<span class="tag">Bluetooth APIs</span>` +
    `</div>` +
  `</div>` +
  `<div class="skill-card c-green reveal">` +
    `<div class="skill-icon" aria-hidden="true">🧪</div>` +
    `<div class="skill-name">QA &amp; Concepts</div>` +
    `<div class="tag-row">` +
      `<span class="tag">Manual Testing</span>` +
      `<span class="tag">Test Case Writing</span>` +
      `<span class="tag">REST APIs</span>` +
      `<span class="tag">OOP</span>` +
      `<span class="tag">SDLC</span>` +
      `<span class="tag">SQL Injection Prevention</span>` +
      `<span class="tag">Prompt Engineering</span>` +
    `</div>` +
  `</div>`;

export async function renderSkills() {
  await CSS_LOADED;
  const el = document.getElementById('skillsGrid');
  if (!el || takeSSR(el, '/skills')) return;

  el.innerHTML = '<div class="skel skel-card"></div>'.repeat(4);
  const rows = await fetchSheet(CFG.api.skills, 'skills', fresh => {
    if (fresh?.length && document.getElementById('view-skills')?.classList.contains('active')) {
      el.innerHTML = skillsHTML(fresh);
      watchReveals();
    }
  });
  el.innerHTML = rows?.length ? skillsHTML(rows) : FALLBACK_HTML;
}
