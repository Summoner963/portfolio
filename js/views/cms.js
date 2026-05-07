// js/views/cms.js
// Content Studio — full CMS UI.
//
// Dashboard structure:
//   After login → two sections: "All Blogs" and "All Chords"
//   Each section shows a searchable/filterable list of existing entries.
//   "Add New" button opens a blank form.
//   Clicking a row opens that entry pre-filled for editing.
//   After publish/update → returns to the list view.
//
// Editors:
//   Blog    — split pane with markdown toolbar (H2, H3, bold, italic,
//             code, link, color, bullet, image placeholder, special chars)
//   Chords  — natural textarea (press Enter normally); converted to
//             pipe-separated format before sending to the sheet.
//             blogimage rows managed inline; faq rows managed inline.

import { esc, loadCSS, showToast, md } from '../utils.js';

const SESSION_KEY = 'sd_cms_token';

function getToken()  { return sessionStorage.getItem(SESSION_KEY); }
function setToken(t) { sessionStorage.setItem(SESSION_KEY, t); }
function clearToken(){ sessionStorage.removeItem(SESSION_KEY); }
function isLoggedIn(){ return !!sessionStorage.getItem(SESSION_KEY); }

// ── API helpers ────────────────────────────────────────────────────────────

async function apiLogin(username, password) {
  const r = await fetch('/api/cms/auth', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  });
  return r.json();
}

/**
 * Read all rows from a sheet tab.
 * @param {string} sheet
 * @returns {Promise<{ok:boolean, rows?:object[], error?:string}>}
 */
async function apiRead(sheet) {
  const r = await fetch('/api/cms/read', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ action: 'read', sheet }),
  });
  return r.json();
}

/**
 * Append a new row.
 * @param {string} sheet
 * @param {object} row
 */
async function apiAppend(sheet, row) {
  const r = await fetch('/api/cms/write', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ action: 'append', sheet, row }),
  });
  return r.json();
}

/**
 * Update an existing row by slug.
 * @param {string} sheet
 * @param {string} slug
 * @param {object} row
 * @param {string} [slugField='Slug']
 */
async function apiUpdate(sheet, slug, row, slugField = 'Slug') {
  const r = await fetch('/api/cms/write', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ action: 'update', sheet, slug, slugField, row }),
  });
  return r.json();
}

/**
 * Delete a row by slug.
 */
async function apiDelete(sheet, slug, slugField = 'Slug') {
  const r = await fetch('/api/cms/write', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ action: 'delete', sheet, slug, slugField }),
  });
  return r.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Convert natural line-break chord text → pipe-separated format for the sheet.
 * Empty lines become ||, regular newlines become |.
 */
function linesTopipes(text) {
  return text
    .split('\n')
    .map(line => line === '' ? '' : line)
    .join('|')
    // collapse runs of || for empty paragraphs
    .replace(/\|{3,}/g, '||');
}

/**
 * Convert pipe-separated chord format → natural line breaks for the editor.
 */
function pipesToLines(raw) {
  if (!raw) return '';
  return raw.split('|').join('\n');
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function renderCMS() {
  await loadCSS('/css/cms.css');
  const view = document.getElementById('view-cms');
  if (!view) return;

  if (isLoggedIn()) {
    renderDashboard(view);
  } else {
    renderLogin(view);
  }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────

function renderLogin(view) {
  view.innerHTML = `
    <div class="cms-login-wrap">
      <div class="cms-login-card">
        <div class="cms-login-logo">
          <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="9" fill="#1b4332"/>
            <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle"
              font-family="Georgia,serif" font-size="26" fill="#fff">SD</text>
          </svg>
        </div>
        <h2 class="cms-login-title">Content Studio</h2>
        <p class="cms-login-sub">Sign in to manage your content</p>
        <form class="cms-login-form" id="cmsLoginForm" autocomplete="on">
          <div class="cms-field">
            <label class="cms-label" for="cmsUser">Username</label>
            <input class="cms-input" type="text" id="cmsUser"
              name="username" autocomplete="username" required placeholder="your username" />
          </div>
          <div class="cms-field">
            <label class="cms-label" for="cmsPw">Password</label>
            <input class="cms-input" type="password" id="cmsPw"
              name="password" autocomplete="current-password" required placeholder="••••••••" />
          </div>
          <div class="cms-login-error" id="cmsLoginError" hidden></div>
          <button class="cms-btn cms-btn-primary" type="submit" id="cmsLoginBtn">Sign in</button>
        </form>
      </div>
    </div>`;

  const form     = document.getElementById('cmsLoginForm');
  const errEl    = document.getElementById('cmsLoginError');
  const loginBtn = document.getElementById('cmsLoginBtn');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('cmsUser').value.trim();
    const password = document.getElementById('cmsPw').value;
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Signing in…';
    errEl.hidden         = true;

    try {
      const result = await apiLogin(username, password);
      if (result.ok && result.token) {
        setToken(result.token);
        renderDashboard(view);
      } else {
        errEl.textContent = result.error || 'Invalid credentials';
        errEl.hidden      = false;
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Sign in';
      }
    } catch {
      errEl.textContent    = 'Network error — try again';
      errEl.hidden         = false;
      loginBtn.disabled    = false;
      loginBtn.textContent = 'Sign in';
    }
  });
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
// Two tabs: All Blogs | All Chords
// Each tab shows a list with search/filter/sort + "Add New" button.

function renderDashboard(view, activeTab = 'blog') {
  view.innerHTML = `
    <div class="cms-wrap">
      <header class="cms-header">
        <div class="cms-header-left">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="9" fill="#1b4332"/>
            <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle"
              font-family="Georgia,serif" font-size="26" fill="#fff">SD</text>
          </svg>
          <span class="cms-header-title">Content Studio</span>
        </div>
        <button class="cms-btn cms-btn-ghost cms-signout" id="cmsSignOut">Sign out</button>
      </header>

      <div class="cms-tabs" role="tablist">
        <button class="cms-tab${activeTab === 'blog'   ? ' active' : ''}"
          data-tab="blog"   role="tab"
          aria-selected="${activeTab === 'blog'}">📝 Blog Posts</button>
        <button class="cms-tab${activeTab === 'chords' ? ' active' : ''}"
          data-tab="chords" role="tab"
          aria-selected="${activeTab === 'chords'}">🎸 Chord Sheets</button>
      </div>

      <div class="cms-body">
        <div class="cms-panel" id="panel-blog"   ${activeTab !== 'blog'   ? 'hidden' : ''}></div>
        <div class="cms-panel" id="panel-chords" ${activeTab !== 'chords' ? 'hidden' : ''}></div>
      </div>
    </div>`;

  // Tab switching
  view.querySelectorAll('.cms-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      view.querySelectorAll('.cms-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      view.querySelectorAll('.cms-panel').forEach(p => { p.hidden = true; });
      const panel = document.getElementById(`panel-${tab.dataset.tab}`);
      if (panel) panel.hidden = false;
    });
  });

  // Sign out
  document.getElementById('cmsSignOut').addEventListener('click', () => {
    clearToken();
    renderLogin(view);
  });

  // Load both list panels
  renderBlogList(document.getElementById('panel-blog'),   view);
  renderChordList(document.getElementById('panel-chords'), view);
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOG LIST VIEW
// ─────────────────────────────────────────────────────────────────────────

async function renderBlogList(panel, view) {
  panel.innerHTML = `
    <div class="cms-list-wrap">
      <div class="cms-list-header">
        <h3 class="cms-form-title">Blog Posts</h3>
        <button class="cms-btn cms-btn-primary" id="blogAddNew">+ Add New Post</button>
      </div>
      <div class="cms-list-toolbar">
        <input class="cms-input cms-list-search" id="blogListSearch"
          type="search" placeholder="Search posts…" autocomplete="off" />
        <select class="cms-input cms-select cms-list-sort" id="blogListSort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">Title A–Z</option>
        </select>
      </div>
      <div class="cms-list-body" id="blogListBody">
        <div class="cms-list-loading">Loading posts…</div>
      </div>
    </div>`;

  document.getElementById('blogAddNew').addEventListener('click', () => {
    renderBlogForm(panel, view, null);
  });

  let rows = [];

  try {
    const result = await apiRead('blog');
    if (result.ok) {
      rows = result.rows || [];
    } else {
      document.getElementById('blogListBody').innerHTML =
        `<div class="cms-list-empty">Error loading posts: ${esc(result.error || 'Unknown error')}</div>`;
      return;
    }
  } catch (e) {
    document.getElementById('blogListBody').innerHTML =
      `<div class="cms-list-empty">Network error loading posts.</div>`;
    return;
  }

  function renderList() {
    const search = (document.getElementById('blogListSearch')?.value || '').toLowerCase();
    const sort   =  document.getElementById('blogListSort')?.value || 'newest';

    let filtered = rows.filter(r =>
      !search ||
      (r.Title    || '').toLowerCase().includes(search) ||
      (r.Category || '').toLowerCase().includes(search) ||
      (r.Tags     || '').toLowerCase().includes(search)
    );

    filtered.sort((a, b) => {
      if (sort === 'newest') return new Date(b.Date || 0) - new Date(a.Date || 0);
      if (sort === 'oldest') return new Date(a.Date || 0) - new Date(b.Date || 0);
      if (sort === 'az')     return (a.Title || '').localeCompare(b.Title || '');
      return 0;
    });

    const body = document.getElementById('blogListBody');
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = `<div class="cms-list-empty">${
        rows.length ? 'No posts match your search.' : 'No posts yet. Click "Add New Post" to create one.'
      }</div>`;
      return;
    }

    body.innerHTML = '';
    filtered.forEach(row => {
      const item = document.createElement('div');
      item.className = 'cms-list-item';
      item.innerHTML =
        `<div class="cms-list-item-main">
          <span class="cms-list-item-title">${esc(row.Title || '(no title)')}</span>
          <span class="cms-list-item-meta">
            ${row.Category ? `<span class="cms-list-badge">${esc(row.Category)}</span>` : ''}
            ${row.Date     ? `<span class="cms-list-date">${esc(row.Date)}</span>` : ''}
          </span>
        </div>
        <div class="cms-list-item-actions">
          <button class="cms-btn cms-btn-ghost cms-btn-sm" data-action="edit">Edit</button>
          <button class="cms-btn cms-btn-danger cms-btn-sm" data-action="delete">Delete</button>
        </div>`;

      item.querySelector('[data-action="edit"]').addEventListener('click', () => {
        renderBlogForm(panel, view, row, rows);
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete "${row.Title}"? This cannot be undone.`)) return;
        const r = await apiDelete('blog', row.Slug);
        if (r.ok) {
          showToast('Post deleted');
          rows = rows.filter(x => x.Slug !== row.Slug);
          renderList();
        } else {
          showToast(r.error || 'Delete failed', 'error');
        }
      });

      body.appendChild(item);
    });
  }

  document.getElementById('blogListSearch').addEventListener('input', renderList);
  document.getElementById('blogListSort').addEventListener('change', renderList);
  renderList();
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOG FORM (Add New / Edit)
// ─────────────────────────────────────────────────────────────────────────

async function renderBlogForm(panel, view, existingRow, allRows) {
  const isEdit = !!existingRow;

  // Load blogimage and faq rows for this slug if editing
  let biRows  = []; // blogimage rows
  let faqRows = []; // faq rows

  if (isEdit && existingRow.Slug) {
    const [biResult, faqResult] = await Promise.all([
      apiRead('blogimage'),
      apiRead('faq'),
    ]);
    if (biResult.ok)  biRows  = (biResult.rows  || []).filter(r => r.Blog_Slug === existingRow.Slug);
    if (faqResult.ok) faqRows = (faqResult.rows  || []).filter(r => r.Blog_Slug === existingRow.Slug);
  }

  const r = existingRow || {};

  panel.innerHTML = `
    <div class="cms-form-wrap">
      <div class="cms-form-topbar">
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="blogBackToList">← All Posts</button>
        <h3 class="cms-form-title">${isEdit ? 'Edit Post' : 'New Blog Post'}</h3>
      </div>

      <div class="cms-row">
        <div class="cms-field cms-field-wide">
          <label class="cms-label">Title *</label>
          <input class="cms-input" id="bTitle" type="text"
            value="${esc(r.Title || '')}" placeholder="My awesome blog post" required />
        </div>
        <div class="cms-field">
          <label class="cms-label">Slug</label>
          <input class="cms-input" id="bSlug" type="text"
            value="${esc(r.Slug || '')}" placeholder="auto-generated"
            ${isEdit ? 'readonly style="opacity:.6;cursor:not-allowed"' : ''} />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Date</label>
          <input class="cms-input" id="bDate" type="date" value="${esc(r.Date || today())}" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Category</label>
          <input class="cms-input" id="bCategory" type="text"
            value="${esc(r.Category || '')}" placeholder="Dev, QA, Tutorial…" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Tags</label>
          <input class="cms-input" id="bTags" type="text"
            value="${esc(r.Tags || '')}" placeholder="tag1, tag2" />
        </div>
      </div>

      <div class="cms-field">
        <label class="cms-label">Excerpt *</label>
        <textarea class="cms-input cms-textarea-sm" id="bExcerpt" rows="2"
          placeholder="One sentence for SEO and card preview…">${esc(r.Excerpt || '')}</textarea>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Image URL <span class="cms-label-hint">Main cover image</span></label>
          <input class="cms-input" id="bImageUrl" type="url"
            value="${esc(r.Image_URL || '')}" placeholder="https://drive.google.com/…" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Image Alt</label>
          <input class="cms-input" id="bImageAlt" type="text"
            value="${esc(r.Image_Alt || '')}" placeholder="Descriptive alt text" />
        </div>
      </div>

      <!-- Inline blog images (blogimage sheet) -->
      <div class="cms-field">
        <label class="cms-label">
          Inline Images
          <span class="cms-label-hint">
            These map to [img1] [img2] placeholders in your content.
            Blog_Slug is set automatically from the Slug field above.
          </span>
        </label>
        <div id="bImageRows" class="cms-inline-rows"></div>
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="bAddImage" type="button">+ Add Image Row</button>
      </div>

      <!-- FAQ rows -->
      <div class="cms-field">
        <label class="cms-label">
          FAQ Items
          <span class="cms-label-hint">Each FAQ row links to this post by slug. Blog_Slug is auto-set.</span>
        </label>
        <div id="bFaqRows" class="cms-inline-rows"></div>
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="bAddFaq" type="button">+ Add FAQ</button>
      </div>

      <!-- Content editor with toolbar -->
      <div class="cms-field">
        <label class="cms-label">
          Content
          <span class="cms-label-hint">
            Markdown. Use [img1], [img2]… to embed inline images from the table above.
          </span>
        </label>
        <div class="cms-toolbar" id="bToolbar" role="toolbar" aria-label="Formatting toolbar"></div>
        <div class="cms-editor-wrap">
          <div class="cms-editor-pane">
            <div class="cms-editor-label">Write</div>
            <textarea class="cms-input cms-editor" id="bContent"
              rows="22" spellcheck="true"
              placeholder="Write your blog post in markdown…">${esc(r.Content || '')}</textarea>
          </div>
          <div class="cms-preview-pane">
            <div class="cms-editor-label">Preview</div>
            <div class="cms-preview article-body" id="bPreview"></div>
          </div>
        </div>
      </div>

      <div class="cms-actions">
        <button class="cms-btn cms-btn-primary" id="bPublish">
          ${isEdit ? '💾 Save Changes' : 'Publish to Sheet →'}
        </button>
        <button class="cms-btn cms-btn-ghost" id="blogBackToList2">Cancel</button>
        <span class="cms-status" id="bStatus"></span>
      </div>
    </div>`;

  // Back buttons
  const goBack = () => renderBlogList(panel, view);
  document.getElementById('blogBackToList') .addEventListener('click', goBack);
  document.getElementById('blogBackToList2').addEventListener('click', goBack);

  // Slug auto-gen
  const titleEl = document.getElementById('bTitle');
  const slugEl  = document.getElementById('bSlug');
  if (!isEdit) {
    titleEl.addEventListener('input', () => {
      if (!slugEl._manuallyEdited) slugEl.value = makeSlug(titleEl.value);
    });
    slugEl.addEventListener('input', () => { slugEl._manuallyEdited = true; });
  }

  // ── Inline image rows ─────────────────────────────────────────────────
  const imageRowsEl = document.getElementById('bImageRows');
  let imageRows = biRows.length
    ? biRows.map(r => ({ num: r.Img_Number || '', url: r.Img_URL || '', alt: r.Img_Alt || '' }))
    : [];

  function renderImageRows() {
    imageRowsEl.innerHTML = '';
    imageRows.forEach((ir, idx) => {
      const row = document.createElement('div');
      row.className = 'cms-inline-row';
      row.innerHTML =
        `<span class="cms-inline-label">[img${idx + 1}]</span>
         <input class="cms-input cms-inline-input" type="url"
           placeholder="Image URL" value="${esc(ir.url)}" data-field="url" />
         <input class="cms-input cms-inline-input" type="text"
           placeholder="Alt text" value="${esc(ir.alt)}" data-field="alt" />
         <button class="cms-btn cms-btn-danger cms-btn-xs" data-rm="${idx}" type="button">✕</button>`;
      row.querySelector('[data-field="url"]').addEventListener('input', e => {
        imageRows[idx].url = e.target.value;
      });
      row.querySelector('[data-field="alt"]').addEventListener('input', e => {
        imageRows[idx].alt = e.target.value;
      });
      row.querySelector(`[data-rm="${idx}"]`).addEventListener('click', () => {
        imageRows.splice(idx, 1);
        renderImageRows();
      });
      imageRowsEl.appendChild(row);
    });
  }

  document.getElementById('bAddImage').addEventListener('click', () => {
    imageRows.push({ num: '', url: '', alt: '' });
    renderImageRows();
  });

  renderImageRows();

  // ── FAQ rows ──────────────────────────────────────────────────────────
  const faqRowsEl = document.getElementById('bFaqRows');
  let faqItems = faqRows.length
    ? faqRows.map(r => ({ q: r.FAQ_Question || '', a: r.FAQ_Answer || '' }))
    : [];

  function renderFaqRows() {
    faqRowsEl.innerHTML = '';
    faqItems.forEach((fq, idx) => {
      const row = document.createElement('div');
      row.className = 'cms-inline-row cms-faq-row';
      row.innerHTML =
        `<div class="cms-faq-fields">
           <input class="cms-input" type="text"
             placeholder="Question" value="${esc(fq.q)}" data-field="q" />
           <textarea class="cms-input cms-textarea-sm" rows="2"
             placeholder="Answer">${esc(fq.a)}</textarea>
         </div>
         <button class="cms-btn cms-btn-danger cms-btn-xs" data-rm="${idx}" type="button">✕</button>`;
      row.querySelector('[data-field="q"]').addEventListener('input', e => {
        faqItems[idx].q = e.target.value;
      });
      row.querySelector('textarea').addEventListener('input', e => {
        faqItems[idx].a = e.target.value;
      });
      row.querySelector(`[data-rm="${idx}"]`).addEventListener('click', () => {
        faqItems.splice(idx, 1);
        renderFaqRows();
      });
      faqRowsEl.appendChild(row);
    });
  }

  document.getElementById('bAddFaq').addEventListener('click', () => {
    faqItems.push({ q: '', a: '' });
    renderFaqRows();
  });

  renderFaqRows();

  // ── Markdown toolbar ──────────────────────────────────────────────────
  buildMarkdownToolbar(
    document.getElementById('bToolbar'),
    document.getElementById('bContent'),
    document.getElementById('bPreview')
  );

  // ── Live preview ──────────────────────────────────────────────────────
  const contentEl = document.getElementById('bContent');
  const previewEl = document.getElementById('bPreview');

  // Initial preview
  if (contentEl.value) previewEl.innerHTML = md(contentEl.value);

  let previewTimer;
  contentEl.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewEl.innerHTML = md(contentEl.value);
    }, 300);
  });

  // ── Publish / Update ──────────────────────────────────────────────────
  document.getElementById('bPublish').addEventListener('click', async () => {
    const title    = document.getElementById('bTitle').value.trim();
    const slug     = document.getElementById('bSlug').value.trim() || makeSlug(title);
    const date     = document.getElementById('bDate').value || today();
    const category = document.getElementById('bCategory').value.trim();
    const tags     = document.getElementById('bTags').value.trim();
    const excerpt  = document.getElementById('bExcerpt').value.trim();
    const imageUrl = document.getElementById('bImageUrl').value.trim();
    const imageAlt = document.getElementById('bImageAlt').value.trim();
    const content  = document.getElementById('bContent').value;
    const statusEl = document.getElementById('bStatus');
    const btn      = document.getElementById('bPublish');

    if (!title)   { showToast('Title is required',   'error'); return; }
    if (!excerpt) { showToast('Excerpt is required', 'error'); return; }

    btn.disabled    = true;
    btn.textContent = isEdit ? 'Saving…' : 'Publishing…';
    statusEl.textContent = '';

    const row = {
      ID:        r.ID || '',
      Title:     title,
      Slug:      slug,
      Category:  category,
      Excerpt:   excerpt,
      Content:   content,
      Date:      date,
      Tags:      tags,
      Image_URL: imageUrl,
      Image_Alt: imageAlt,
    };

    try {
      // Save main blog row
      const result = isEdit
        ? await apiUpdate('blog', r.Slug, row)
        : await apiAppend('blog', row);

      if (!result.ok) {
        showToast(result.error || 'Save failed', 'error');
        statusEl.textContent = '✗ ' + (result.error || 'Error');
        statusEl.style.color = '#991b1b';
        btn.disabled    = false;
        btn.textContent = isEdit ? '💾 Save Changes' : 'Publish to Sheet →';
        return;
      }

      // Save blogimage rows
      // Strategy: delete all existing for this slug, then append current ones
      if (isEdit && biRows.length) {
        for (const bi of biRows) {
          await apiDelete('blogimage', slug, 'Blog_Slug');
        }
      }
      for (let i = 0; i < imageRows.length; i++) {
        if (imageRows[i].url) {
          await apiAppend('blogimage', {
            Blog_Slug: slug,
            Img_Number: String(i + 1),
            Img_URL:    imageRows[i].url,
            Img_Alt:    imageRows[i].alt,
          });
        }
      }

      // Save FAQ rows
      if (isEdit && faqRows.length) {
        for (const fq of faqRows) {
          await apiDelete('faq', slug, 'Blog_Slug');
        }
      }
      for (let i = 0; i < faqItems.length; i++) {
        if (faqItems[i].q) {
          await apiAppend('faq', {
            Blog_Slug:    slug,
            FAQ_Number:   String(i + 1),
            FAQ_Question: faqItems[i].q,
            FAQ_Answer:   faqItems[i].a,
          });
        }
      }

      showToast(isEdit ? 'Post updated!' : 'Post published!');
      // Return to list
      renderBlogList(panel, view);

    } catch (e) {
      showToast('Network error', 'error');
      btn.disabled    = false;
      btn.textContent = isEdit ? '💾 Save Changes' : 'Publish to Sheet →';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  MARKDOWN TOOLBAR
// ─────────────────────────────────────────────────────────────────────────

const COLORS = ['#2d6a4f','#1b4332','#e63946','#f4a261','#457b9d','#6d6875'];

const TOOLBAR_ACTIONS = [
  { label: 'H2',    title: 'Heading 2',    wrap: ['## ',      ''],         block: true  },
  { label: 'H3',    title: 'Heading 3',    wrap: ['### ',     ''],         block: true  },
  { label: 'B',     title: 'Bold',         wrap: ['**',       '**'],       block: false },
  { label: 'I',     title: 'Italic',       wrap: ['*',        '*'],        block: false },
  { label: '`',     title: 'Inline code',  wrap: ['`',        '`'],        block: false },
  { label: '```',   title: 'Code block',   wrap: ['```\n',    '\n```'],    block: true  },
  { label: '🔗',    title: 'Link',         wrap: ['[',        '](url)'],   block: false },
  { label: '—',     title: 'Separator',    insert: '\n---\n'                            },
  { label: '•',     title: 'Bullet list',  wrap: ['- ',       ''],         block: true  },
  { label: '[img]', title: 'Image placeholder (increments automatically)',
    insertFn: (ta) => {
      // Count existing [imgN] to pick next number
      const matches = (ta.value.match(/\[img(\d+)\]/g) || []);
      const next    = matches.length + 1;
      return `[img${next}]`;
    }
  },
];

const SPECIAL_CHARS = [
  '—', '–', '…', '"', '"', ''', ''', '«', '»',
  '©', '®', '™', '→', '←', '↑', '↓', '✓', '✗',
  '•', '·', '°', '№', '₹', '€', '£',
];

function buildMarkdownToolbar(toolbar, textarea, preview) {
  toolbar.innerHTML = '';

  // Action buttons
  TOOLBAR_ACTIONS.forEach(action => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'cms-tb-btn';
    btn.title     = action.title;
    btn.innerHTML = `<span>${action.label}</span>`;

    btn.addEventListener('click', () => {
      applyToolbarAction(textarea, action);
      setTimeout(() => { if (preview) preview.innerHTML = md(textarea.value); }, 50);
      textarea.focus();
    });

    toolbar.appendChild(btn);
  });

  // Separator
  const sep = document.createElement('span');
  sep.className = 'cms-tb-sep';
  toolbar.appendChild(sep);

  // Color picker
  const colorWrap = document.createElement('div');
  colorWrap.className = 'cms-tb-color-wrap';
  colorWrap.title     = 'Text color';
  colorWrap.innerHTML = `<button class="cms-tb-btn cms-tb-color-btn" type="button" title="Text color">
    <span id="colorSwatch" style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#2d6a4f;vertical-align:middle"></span>
    <span>Color</span>
  </button>
  <div class="cms-color-picker" id="colorPicker" hidden>
    ${COLORS.map(c =>
      `<button class="cms-color-swatch" style="background:${c}" data-color="${c}" type="button" title="${c}"></button>`
    ).join('')}
    <input type="color" class="cms-color-custom" id="colorCustom" value="#2d6a4f" title="Custom color" />
  </div>`;

  let activeColor = COLORS[0];

  colorWrap.querySelector('.cms-tb-color-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const picker = document.getElementById('colorPicker');
    picker.hidden = !picker.hidden;
  });

  colorWrap.querySelectorAll('.cms-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      activeColor = sw.dataset.color;
      document.getElementById('colorSwatch').style.background = activeColor;
      document.getElementById('colorPicker').hidden = true;
      applyColor(textarea, activeColor);
      setTimeout(() => { if (preview) preview.innerHTML = md(textarea.value); }, 50);
      textarea.focus();
    });
  });

  const customColor = document.getElementById('colorCustom');
  if (customColor) {
    customColor.addEventListener('input', e => {
      activeColor = e.target.value;
      document.getElementById('colorSwatch').style.background = activeColor;
    });
    customColor.addEventListener('change', e => {
      activeColor = e.target.value;
      document.getElementById('colorPicker').hidden = true;
      applyColor(textarea, activeColor);
      setTimeout(() => { if (preview) preview.innerHTML = md(textarea.value); }, 50);
      textarea.focus();
    });
  }

  toolbar.appendChild(colorWrap);

  // Special characters
  const sep2 = document.createElement('span');
  sep2.className = 'cms-tb-sep';
  toolbar.appendChild(sep2);

  const specialBtn = document.createElement('button');
  specialBtn.type      = 'button';
  specialBtn.className = 'cms-tb-btn';
  specialBtn.title     = 'Special characters';
  specialBtn.innerHTML = '<span>Ω</span>';

  const specialPicker = document.createElement('div');
  specialPicker.className = 'cms-special-picker';
  specialPicker.hidden    = true;
  specialPicker.id        = 'specialPicker';

  SPECIAL_CHARS.forEach(ch => {
    const b = document.createElement('button');
    b.type      = 'button';
    b.className = 'cms-special-char';
    b.textContent = ch;
    b.title       = ch;
    b.addEventListener('click', () => {
      insertAtCursor(textarea, ch, '');
      specialPicker.hidden = true;
      setTimeout(() => { if (preview) preview.innerHTML = md(textarea.value); }, 50);
      textarea.focus();
    });
    specialPicker.appendChild(b);
  });

  specialBtn.addEventListener('click', e => {
    e.stopPropagation();
    specialPicker.hidden = !specialPicker.hidden;
    document.getElementById('colorPicker') && (document.getElementById('colorPicker').hidden = true);
  });

  toolbar.appendChild(specialBtn);
  toolbar.appendChild(specialPicker);

  // Close pickers on outside click
  document.addEventListener('click', () => {
    const cp = document.getElementById('colorPicker');
    const sp = document.getElementById('specialPicker');
    if (cp) cp.hidden = true;
    if (sp) sp.hidden = true;
  }, true);
}

function applyToolbarAction(textarea, action) {
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const sel   = textarea.value.slice(start, end);

  if (action.insert) {
    insertAtCursor(textarea, action.insert, '');
    return;
  }

  if (action.insertFn) {
    const text = action.insertFn(textarea);
    insertAtCursor(textarea, text, '');
    return;
  }

  if (action.wrap) {
    const [before, after] = action.wrap;
    if (action.block && !sel) {
      // Block-level: operate on current line
      const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd   = textarea.value.indexOf('\n', end);
      const realEnd   = lineEnd === -1 ? textarea.value.length : lineEnd;
      const line      = textarea.value.slice(lineStart, realEnd);
      const newText   = before + line + after;
      textarea.setRangeText(newText, lineStart, realEnd, 'select');
    } else {
      // Inline: wrap selection
      const newText = before + sel + after;
      textarea.setRangeText(newText, start, end, 'select');
    }
  }
}

function applyColor(textarea, color) {
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const sel   = textarea.value.slice(start, end) || 'text';
  // Use HTML span — md() passes through inline HTML
  const wrapped = `<span style="color:${color}">${sel}</span>`;
  textarea.setRangeText(wrapped, start, end, 'end');
}

function insertAtCursor(textarea, before, after) {
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const sel   = textarea.value.slice(start, end);
  textarea.setRangeText(before + sel + after, start, end, 'end');
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD LIST VIEW
// ─────────────────────────────────────────────────────────────────────────

async function renderChordList(panel, view) {
  panel.innerHTML = `
    <div class="cms-list-wrap">
      <div class="cms-list-header">
        <h3 class="cms-form-title">Chord Sheets</h3>
        <button class="cms-btn cms-btn-primary" id="chordAddNew">+ Add New Chord Sheet</button>
      </div>
      <div class="cms-list-toolbar">
        <input class="cms-input cms-list-search" id="chordListSearch"
          type="search" placeholder="Search songs, artists…" autocomplete="off" />
        <select class="cms-input cms-select cms-list-sort" id="chordListSort">
          <option value="newest">Newest first</option>
          <option value="az">Title A–Z</option>
          <option value="artist">By artist</option>
        </select>
        <select class="cms-input cms-select" id="chordListDiff">
          <option value="">All difficulties</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div class="cms-list-body" id="chordListBody">
        <div class="cms-list-loading">Loading chord sheets…</div>
      </div>
    </div>`;

  document.getElementById('chordAddNew').addEventListener('click', () => {
    renderChordForm(panel, view, null);
  });

  let rows = [];

  try {
    const result = await apiRead('chords');
    if (result.ok) {
      rows = result.rows || [];
    } else {
      document.getElementById('chordListBody').innerHTML =
        `<div class="cms-list-empty">Error loading chord sheets: ${esc(result.error || 'Unknown error')}</div>`;
      return;
    }
  } catch (e) {
    document.getElementById('chordListBody').innerHTML =
      `<div class="cms-list-empty">Network error loading chord sheets.</div>`;
    return;
  }

  function renderList() {
    const search = (document.getElementById('chordListSearch')?.value || '').toLowerCase();
    const sort   =  document.getElementById('chordListSort')?.value   || 'newest';
    const diff   = (document.getElementById('chordListDiff')?.value   || '').toLowerCase();

    let filtered = rows.filter(r =>
      (!search ||
        (r.Title  || '').toLowerCase().includes(search) ||
        (r.Artist || '').toLowerCase().includes(search)) &&
      (!diff || (r.Difficulty || '').toLowerCase() === diff)
    );

    filtered.sort((a, b) => {
      if (sort === 'newest') return new Date(b.Date_Added || 0) - new Date(a.Date_Added || 0);
      if (sort === 'az')     return (a.Title  || '').localeCompare(b.Title  || '');
      if (sort === 'artist') return (a.Artist || '').localeCompare(b.Artist || '');
      return 0;
    });

    const body = document.getElementById('chordListBody');
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = `<div class="cms-list-empty">${
        rows.length ? 'No chord sheets match your search.' : 'No chord sheets yet. Click "Add New" to create one.'
      }</div>`;
      return;
    }

    body.innerHTML = '';
    filtered.forEach(row => {
      const item = document.createElement('div');
      item.className = 'cms-list-item';
      item.innerHTML =
        `<div class="cms-list-item-main">
          <span class="cms-list-item-title">${esc(row.Title || '(no title)')}</span>
          <span class="cms-list-item-meta">
            <span class="cms-list-badge">${esc(row.Artist || '')}</span>
            ${row.Key        ? `<span class="cms-list-badge">Key ${esc(row.Key)}</span>` : ''}
            ${row.Difficulty ? `<span class="cms-list-badge">${esc(row.Difficulty)}</span>` : ''}
            ${row.Date_Added ? `<span class="cms-list-date">${esc(row.Date_Added)}</span>` : ''}
          </span>
        </div>
        <div class="cms-list-item-actions">
          <button class="cms-btn cms-btn-ghost cms-btn-sm" data-action="edit">Edit</button>
          <button class="cms-btn cms-btn-danger cms-btn-sm" data-action="delete">Delete</button>
        </div>`;

      item.querySelector('[data-action="edit"]').addEventListener('click', () => {
        renderChordForm(panel, view, row, rows);
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete "${row.Title}"? This cannot be undone.`)) return;
        const res = await apiDelete('chords', row.Slug);
        if (res.ok) {
          showToast('Chord sheet deleted');
          rows = rows.filter(x => x.Slug !== row.Slug);
          renderList();
        } else {
          showToast(res.error || 'Delete failed', 'error');
        }
      });

      body.appendChild(item);
    });
  }

  document.getElementById('chordListSearch').addEventListener('input', renderList);
  document.getElementById('chordListSort').addEventListener('change', renderList);
  document.getElementById('chordListDiff').addEventListener('change', renderList);
  renderList();
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD FORM (Add New / Edit)
// ─────────────────────────────────────────────────────────────────────────

function renderChordForm(panel, view, existingRow) {
  const isEdit = !!existingRow;
  const r      = existingRow || {};

  const keys = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B',
                 'Cm','Dm','Em','Am','Fm','Gm'];
  const keyOptions = ['<option value="">-- select --</option>',
    ...keys.map(k => `<option value="${esc(k)}"${r.Key === k ? ' selected' : ''}>${esc(k)}</option>`)
  ].join('');

  function sel(val, opt) { return val === opt ? ' selected' : ''; }

  panel.innerHTML = `
    <div class="cms-form-wrap">
      <div class="cms-form-topbar">
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="chordBackToList">← All Chord Sheets</button>
        <h3 class="cms-form-title">${isEdit ? 'Edit Chord Sheet' : 'New Chord Sheet'}</h3>
      </div>

      <div class="cms-row">
        <div class="cms-field cms-field-wide">
          <label class="cms-label">Song Title *</label>
          <input class="cms-input" id="cTitle" type="text"
            value="${esc(r.Title || '')}" placeholder="Timi Bina" required />
        </div>
        <div class="cms-field">
          <label class="cms-label">Slug</label>
          <input class="cms-input" id="cSlug" type="text"
            value="${esc(r.Slug || '')}" placeholder="auto-generated"
            ${isEdit ? 'readonly style="opacity:.6;cursor:not-allowed"' : ''} />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Artist *</label>
          <input class="cms-input" id="cArtist" type="text"
            value="${esc(r.Artist || '')}" placeholder="The Axe Band" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Key</label>
          <select class="cms-input cms-select" id="cKey">${keyOptions}</select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Capo</label>
          <input class="cms-input" id="cCapo" type="number"
            min="0" max="12" value="${esc(r.Capo || '0')}" />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Difficulty</label>
          <select class="cms-input cms-select" id="cDifficulty">
            <option value="beginner"    ${sel(r.Difficulty,'beginner')}>Beginner</option>
            <option value="intermediate"${sel(r.Difficulty,'intermediate') || (!r.Difficulty ? ' selected' : '')}>Intermediate</option>
            <option value="advanced"    ${sel(r.Difficulty,'advanced')}>Advanced</option>
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Category</label>
          <select class="cms-input cms-select" id="cCategory">
            ${['nepali','english','hindi','devotional','folk','pop','rock','classical']
              .map(c => `<option value="${c}"${sel(r.Category,c)}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`)
              .join('')}
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Featured</label>
          <select class="cms-input cms-select" id="cFeatured">
            <option value="false"${sel(r.Featured,'false') || (!r.Featured ? ' selected' : '')}>No</option>
            <option value="true" ${sel(r.Featured,'true')}>Yes</option>
          </select>
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Chords Used</label>
          <input class="cms-input" id="cChordsUsed" type="text"
            value="${esc(r.Chords_Used || '')}" placeholder="G, Em7, Cadd9, D" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Date Added</label>
          <input class="cms-input" id="cDate" type="date" value="${esc(r.Date_Added || today())}" />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Image URL</label>
          <input class="cms-input" id="cImageUrl" type="url" value="${esc(r.Image_URL || '')}" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Image Alt</label>
          <input class="cms-input" id="cImageAlt" type="text" value="${esc(r.Image_Alt || '')}" />
        </div>
      </div>

      <div class="cms-field">
        <label class="cms-label">Excerpt</label>
        <textarea class="cms-input cms-textarea-sm" id="cExcerpt" rows="2"
          placeholder="Learn to play this song with G Em7 Cadd9 chords…">${esc(r.Excerpt || '')}</textarea>
      </div>

      <!-- Natural chord editor: just type and press Enter normally -->
      <div class="cms-field">
        <label class="cms-label">
          Tab Content
          <span class="cms-label-hint">
            Type normally — press <kbd>Enter</kbd> for a new line, leave a blank line for a gap between sections.
            Put chord names in [brackets]: <code>[G]hey its me [C]here</code>
            Start section labels alone on their own line: <code>[Verse 1]</code> or <code>[Chorus]</code>
          </span>
        </label>
        <div class="cms-editor-wrap">
          <div class="cms-editor-pane">
            <div class="cms-editor-label">Write</div>
            <textarea class="cms-input cms-editor cms-editor-mono"
              id="cTabContent" rows="22" spellcheck="false"
              placeholder="[Verse 1]
[G]Hey its me
[C]here with you

[Chorus]
[G]This is the [Em]chorus
[Am]singing [D]along"></textarea>
          </div>
          <div class="cms-preview-pane">
            <div class="cms-editor-label">Preview</div>
            <div class="cms-preview cms-tab-preview" id="cTabPreview"></div>
          </div>
        </div>
      </div>

      <div class="cms-actions">
        <button class="cms-btn cms-btn-primary" id="cPublish">
          ${isEdit ? '💾 Save Changes' : 'Publish to Sheet →'}
        </button>
        <button class="cms-btn cms-btn-ghost" id="chordBackToList2">Cancel</button>
        <span class="cms-status" id="cStatus"></span>
      </div>
    </div>`;

  // Pre-fill natural editor from stored pipe format
  const tabEl = document.getElementById('cTabContent');
  if (r.Tab_Content) tabEl.value = pipesToLines(r.Tab_Content);

  // Back buttons
  const goBack = () => renderChordList(panel, view);
  document.getElementById('chordBackToList') .addEventListener('click', goBack);
  document.getElementById('chordBackToList2').addEventListener('click', goBack);

  // Slug auto-gen
  const titleEl = document.getElementById('cTitle');
  const slugEl  = document.getElementById('cSlug');
  if (!isEdit) {
    titleEl.addEventListener('input', () => {
      if (!slugEl._manuallyEdited) slugEl.value = makeSlug(titleEl.value);
    });
    slugEl.addEventListener('input', () => { slugEl._manuallyEdited = true; });
  }

  // Live tab preview
  const previewEl = document.getElementById('cTabPreview');
  let   previewTimer;

  function updateTabPreview() {
    previewEl.innerHTML = renderTabPreview(tabEl.value);
  }

  tabEl.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updateTabPreview, 300);
  });

  if (tabEl.value) updateTabPreview();

  // Publish / Update
  document.getElementById('cPublish').addEventListener('click', async () => {
    const title      = document.getElementById('cTitle').value.trim();
    const slug       = document.getElementById('cSlug').value.trim() || makeSlug(title);
    const artist     = document.getElementById('cArtist').value.trim();
    const key        = document.getElementById('cKey').value;
    const capo       = document.getElementById('cCapo').value;
    const difficulty = document.getElementById('cDifficulty').value;
    const category   = document.getElementById('cCategory').value;
    const chordsUsed = document.getElementById('cChordsUsed').value.trim();
    const date       = document.getElementById('cDate').value || today();
    const featured   = document.getElementById('cFeatured').value;
    const imageUrl   = document.getElementById('cImageUrl').value.trim();
    const imageAlt   = document.getElementById('cImageAlt').value.trim();
    const excerpt    = document.getElementById('cExcerpt').value.trim();
    const tabRaw     = tabEl.value;
    const tabContent = linesTopipes(tabRaw);
    const statusEl   = document.getElementById('cStatus');
    const btn        = document.getElementById('cPublish');

    if (!title)  { showToast('Title is required',  'error'); return; }
    if (!artist) { showToast('Artist is required', 'error'); return; }

    btn.disabled    = true;
    btn.textContent = isEdit ? 'Saving…' : 'Publishing…';
    statusEl.textContent = '';

    const row = {
      Slug:        slug,
      Title:       title,
      Artist:      artist,
      Key:         key,
      Capo:        capo,
      Difficulty:  difficulty,
      Category:    category,
      Chords_Used: chordsUsed,
      Tab_Content: tabContent,
      Featured:    featured,
      Excerpt:     excerpt,
      Date_Added:  date,
      Image_URL:   imageUrl,
      Image_Alt:   imageAlt,
    };

    try {
      const result = isEdit
        ? await apiUpdate('chords', r.Slug, row)
        : await apiAppend('chords', row);

      if (result.ok) {
        showToast(isEdit ? 'Chord sheet updated!' : 'Chord sheet published!');
        renderChordList(panel, view);
      } else {
        showToast(result.error || 'Save failed', 'error');
        statusEl.textContent = '✗ ' + (result.error || 'Error');
        statusEl.style.color = '#991b1b';
        btn.disabled    = false;
        btn.textContent = isEdit ? '💾 Save Changes' : 'Publish to Sheet →';
      }
    } catch (e) {
      showToast('Network error', 'error');
      btn.disabled    = false;
      btn.textContent = isEdit ? '💾 Save Changes' : 'Publish to Sheet →';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  CHORD TAB PREVIEW (for the CMS editor)
// ─────────────────────────────────────────────────────────────────────────

const CHORD_RE_PREVIEW = /^[A-G][#b]?(maj7|maj|min7|min|m7|m|7|sus2|sus4|add9|dim7|dim|aug|5)?$/;

function renderTabPreview(raw) {
  if (!raw) return '<span style="color:var(--muted-light)">Preview will appear here…</span>';

  // raw is natural line breaks from the editor
  const lines = raw.split('\n');

  return lines.map(line => {
    const trimmed = line.trim();

    if (!trimmed) return '<div style="height:.6rem"></div>';

    // Section label: [Chorus], [Verse 1] etc
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && !CHORD_RE_PREVIEW.test(sectionMatch[1])) {
      return `<div style="font-family:var(--serif);font-weight:500;color:var(--accent2);margin:.8rem 0 .2rem">${esc(sectionMatch[1])}</div>`;
    }

    // Line with chord tokens
    const parts = line.split(/(\[[^\]]+\])/);
    if (parts.length > 1) {
      const spans = parts.map(part => {
        const m = part.match(/^\[([^\]]+)\]$/);
        if (m && CHORD_RE_PREVIEW.test(m[1])) {
          return `<span style="color:var(--accent);font-weight:600">${esc(m[1])}</span>`;
        }
        return esc(part);
      });
      return `<div style="font-family:var(--mono);font-size:.82rem;line-height:2">${spans.join('')}</div>`;
    }

    // Plain lyric line
    return `<div style="font-family:var(--mono);font-size:.82rem;line-height:1.7;color:var(--text)">${esc(line)}</div>`;
  }).join('');
}
//