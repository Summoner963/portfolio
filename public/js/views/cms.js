// js/views/cms.js
// Content Studio — admin CMS UI (login, post list, post form).
// The post editor itself (visual ⇄ Sheet-format markdown) lives in
// js/views/cms-editor.js. All calls go to /api/cms/* (worker/index.js),
// which checks the session cookie + CSRF token and validates every field.

import { esc, loadCSS, showToast } from '../utils.js';
import { isoDate } from '../shared/render.js';
import { mountEditor } from './cms-editor.js';

// ── API helpers ────────────────────────────────────────────────────────────
// Sessions are an HttpOnly cookie set by the worker (JavaScript can't read
// it). The CSRF token is kept only in memory and sent on every call.

let csrfToken = '';

async function cmsCall(path, body) {
  const r = await fetch(path, {
    method:      'POST',
    credentials: 'same-origin',
    headers:     { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body:        JSON.stringify(body),
  });
  const rotated = r.headers.get('X-CSRF-Token');
  if (rotated) csrfToken = rotated; // session was refreshed
  if (r.status === 401 && path !== '/api/cms/login') {
    showToast('Session expired — please sign in again', 'error');
    const view = document.getElementById('view-cms');
    if (view) renderLogin(view);
  }
  try { return await r.json(); } catch { return { ok: false, error: 'Unexpected response' }; }
}

async function apiSession() {
  try {
    const r = await fetch('/api/cms/session', { credentials: 'same-origin' });
    const data = await r.json();
    if (data.ok) csrfToken = data.csrf;
    return data.ok === true;
  } catch { return false; }
}

async function apiLogin(username, password) {
  const result = await cmsCall('/api/cms/login', { username, password });
  if (result.ok) csrfToken = result.csrf || '';
  return result;
}

const apiLogout = () => cmsCall('/api/cms/logout', {}).finally(() => { csrfToken = ''; });
const apiRead   = sheet => cmsCall('/api/cms/read', { sheet });
const apiAppend = (sheet, row) => cmsCall('/api/cms/write', { action: 'append', sheet, row });
// The key column (Slug / Blog_Slug) is decided by the worker, not the client.
const apiUpdate = (sheet, slug, row) => cmsCall('/api/cms/write', { action: 'update', sheet, slug, row });
const apiDelete = (sheet, slug) => cmsCall('/api/cms/write', { action: 'delete', sheet, slug });

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

// Local calendar day (toISOString() is UTC: before 05:45 in Nepal it would
// still say yesterday).
function today() {
  return isoDate(new Date().toString());
}

// "April 18, 2026" → "2026-04-18" for the date input, without shifting the day
function toInputDate(val) {
  return isoDate(val) || today();
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function renderCMS() {
  await loadCSS('/css/cms.css');
  const view = document.getElementById('view-cms');
  if (!view) return;
  if (await apiSession()) renderDashboard(view);
  else renderLogin(view);
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

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('cmsUser').value.trim();
    const password = document.getElementById('cmsPw').value;
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Signing in\u2026';
    errEl.hidden         = true;
    try {
      const result = await apiLogin(username, password);
      if (result.ok) {
        renderDashboard(view);
      } else {
        errEl.textContent    = result.error || 'Invalid username or password';
        errEl.hidden         = false;
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Sign in';
      }
    } catch (err) {
      errEl.textContent    = 'Network error \u2014 try again';
      errEl.hidden         = false;
      loginBtn.disabled    = false;
      loginBtn.textContent = 'Sign in';
    }
  });
}


// ── DASHBOARD ─────────────────────────────────────────────────────────────

function renderDashboard(view, activeTab) {
  if (!activeTab) activeTab = 'blog';

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
        <button class="cms-tab${activeTab === 'blog' ? ' active' : ''}"
          data-tab="blog" role="tab" aria-selected="${activeTab === 'blog'}">\uD83D\uDCDD Blog Posts</button>
        
      </div>
      <div class="cms-body">
        <div class="cms-panel" id="panel-blog"   ${activeTab !== 'blog'   ? 'hidden' : ''}></div>
        </div>
    </div>`;

  view.querySelectorAll('.cms-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      view.querySelectorAll('.cms-tab').forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      view.querySelectorAll('.cms-panel').forEach(function(p) { p.hidden = true; });
      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.hidden = false;
    });
  });

  document.getElementById('cmsSignOut').addEventListener('click', async function() {
    await apiLogout();
    renderLogin(view);
  });

  renderBlogList(document.getElementById('panel-blog'), view);
}

// ── BLOG LIST ─────────────────────────────────────────────────────────────

async function renderBlogList(panel, view) {
  panel.innerHTML = `
    <div class="cms-list-wrap">
      <div class="cms-list-header">
        <h3 class="cms-form-title">Blog Posts</h3>
        <button class="cms-btn cms-btn-primary" id="blogAddNew">+ Add New Post</button>
      </div>
      <div class="cms-list-toolbar">
        <input class="cms-input cms-list-search" id="blogListSearch"
          type="search" placeholder="Search posts\u2026" autocomplete="off" />
        <select class="cms-input cms-select cms-list-sort" id="blogListSort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">Title A\u2013Z</option>
        </select>
      </div>
      <div class="cms-list-body" id="blogListBody">
        <div class="cms-list-loading">Loading posts\u2026</div>
      </div>
    </div>`;

  document.getElementById('blogAddNew').addEventListener('click', function() {
    renderBlogForm(panel, view, null);
  });

  let rows = [];
  try {
    const result = await apiRead('blog');
    if (result.ok) {
      rows = result.rows || [];
    } else {
      document.getElementById('blogListBody').innerHTML =
        '<div class="cms-list-empty">Error loading posts: ' + esc(result.error || 'Unknown error') + '</div>';
      return;
    }
  } catch (e) {
    document.getElementById('blogListBody').innerHTML =
      '<div class="cms-list-empty">Network error loading posts.</div>';
    return;
  }

  function renderList() {
    const search = (document.getElementById('blogListSearch') ? document.getElementById('blogListSearch').value : '').toLowerCase();
    const sort   = document.getElementById('blogListSort') ? document.getElementById('blogListSort').value : 'newest';

    let filtered = rows.filter(function(r) {
      return !search ||
        (r.Title    || '').toLowerCase().includes(search) ||
        (r.Category || '').toLowerCase().includes(search) ||
        (r.Tags     || '').toLowerCase().includes(search);
    });

    filtered.sort(function(a, b) {
      if (sort === 'newest') return new Date(b.Date || 0) - new Date(a.Date || 0);
      if (sort === 'oldest') return new Date(a.Date || 0) - new Date(b.Date || 0);
      if (sort === 'az')     return (a.Title || '').localeCompare(b.Title || '');
      return 0;
    });

    const body = document.getElementById('blogListBody');
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = '<div class="cms-list-empty">' +
        (rows.length ? 'No posts match your search.' : 'No posts yet. Click "Add New Post" to create one.') +
        '</div>';
      return;
    }

    body.innerHTML = '';
    filtered.forEach(function(row) {
      const item = document.createElement('div');
      item.className = 'cms-list-item';
      item.innerHTML =
        '<div class="cms-list-item-main">' +
          '<span class="cms-list-item-title">' + esc(row.Title || '(no title)') + '</span>' +
          '<span class="cms-list-item-meta">' +
            (row.Category ? '<span class="cms-list-badge">' + esc(row.Category) + '</span>' : '') +
            (row.Date     ? '<span class="cms-list-date">'  + esc(row.Date)     + '</span>' : '') +
          '</span>' +
        '</div>' +
        '<div class="cms-list-item-actions">' +
          '<button class="cms-btn cms-btn-ghost cms-btn-sm" data-action="edit">Edit</button>' +
          '<button class="cms-btn cms-btn-danger cms-btn-sm" data-action="delete">Delete</button>' +
        '</div>';

      item.querySelector('[data-action="edit"]').addEventListener('click', function() {
        renderBlogForm(panel, view, row, rows);
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', async function() {
        if (!confirm('Delete "' + row.Title + '"? This cannot be undone.')) return;
        const res = await apiDelete('blog', row.Slug);
        if (res.ok) {
          showToast('Post deleted');
          rows = rows.filter(function(x) { return x.Slug !== row.Slug; });
          renderList();
        } else {
          showToast(res.error || 'Delete failed', 'error');
        }
      });

      body.appendChild(item);
    });
  }

  document.getElementById('blogListSearch').addEventListener('input', renderList);
  document.getElementById('blogListSort').addEventListener('change', renderList);
  renderList();
}

// ── BLOG FORM ─────────────────────────────────────────────────────────────

async function renderBlogForm(panel, view, existingRow, allRows) {
  const isEdit = !!existingRow;
  let biRows  = [];
  let faqRows = [];

  if (isEdit && existingRow.Slug) {
    const results = await Promise.all([apiRead('blogimage'), apiRead('faq')]);
    if (results[0].ok) biRows  = (results[0].rows || []).filter(function(r) { return r.Blog_Slug === existingRow.Slug; });
    if (results[1].ok) faqRows = (results[1].rows || []).filter(function(r) { return r.Blog_Slug === existingRow.Slug; });
  }

  const r = existingRow || {};

  panel.innerHTML = `
    <div class="cms-form-wrap">
      <div class="cms-form-topbar">
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="blogBackToList">\u2190 All Posts</button>
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
          <input class="cms-input" id="bDate" type="date" value="${esc(toInputDate(r.Date))}" />
        </div>
        <div class="cms-field">
          <label class="cms-label" for="bStatusSel">Visibility</label>
          <select class="cms-input cms-status-select" id="bStatusSel">
            <option value="">Published</option>
            <option value="draft"${/^draft$/i.test(r.Status || '') ? ' selected' : ''}>Draft (hidden from the site)</option>
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Category</label>
          <input class="cms-input" id="bCategory" type="text"
            value="${esc(r.Category || '')}" placeholder="Dev, QA, Tutorial\u2026" />
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
          placeholder="One sentence for SEO and card preview\u2026">${esc(r.Excerpt || '')}</textarea>
      </div>
      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Image URL <span class="cms-label-hint">Main cover image</span></label>
          <input class="cms-input" id="bImageUrl" type="url"
            value="${esc(r.Image_URL || '')}" placeholder="https://drive.google.com/\u2026" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Image Alt</label>
          <input class="cms-input" id="bImageAlt" type="text"
            value="${esc(r.Image_Alt || '')}" placeholder="Descriptive alt text" />
        </div>
      </div>
      <div class="cms-field">
        <label class="cms-label">Inline Images
          <span class="cms-label-hint">Map to [img1] [img2] placeholders in content.</span>
        </label>
        <div id="bImageRows" class="cms-inline-rows"></div>
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="bAddImage" type="button">+ Add Image Row</button>
      </div>
      <div class="cms-field">
        <label class="cms-label">FAQ Items
          <span class="cms-label-hint">Each FAQ row links to this post by slug.</span>
        </label>
        <div id="bFaqRows" class="cms-inline-rows"></div>
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="bAddFaq" type="button">+ Add FAQ</button>
      </div>

      <div class="cms-field">
        <label class="cms-label">Content
          <span class="cms-label-hint">
            Write on the left like a normal editor; the right side is the exact text stored in your Sheet
            (each new line starts with <code>|</code>). Edit either side — the other follows.
            Images: add the URL under "Inline Images", then place it with the <code>[img]</code> button.
          </span>
        </label>
        <div class="cms-toolbar" id="bToolbar" role="toolbar" aria-label="Formatting toolbar"></div>
        <div class="cms-editor-wrap">
          <div class="cms-editor-pane">
            <div class="cms-editor-label">
              <span>Visual <span class="cms-editor-label-badge wysiwyg">WHAT READERS SEE</span></span>
              <span class="cms-editor-wc" id="bWC">0 words</span>
            </div>
            <div class="cms-wysiwyg" id="bWysiwyg" contenteditable="true" spellcheck="true"
              role="textbox" aria-multiline="true" aria-label="Post content (visual)"
              data-placeholder="Write your post here…"></div>
          </div>
          <div class="cms-preview-pane">
            <div class="cms-editor-label">
              <span>Sheet format <span class="cms-editor-label-badge markdown">STORED</span></span>
            </div>
            <textarea class="cms-md-pane" id="bMarkdown" spellcheck="false" aria-label="Post content (Sheet format)"
              placeholder="## Heading&#10;|A paragraph with **bold** text&#10;|- a list item&#10;|> [!TIP] A callout"></textarea>
          </div>
        </div>
      </div>

      <div class="cms-actions">
        <button class="cms-btn cms-btn-primary" id="bPublish">
          ${isEdit ? '\uD83D\uDCBE Save Changes' : 'Publish to Sheet \u2192'}
        </button>
        <button class="cms-btn cms-btn-ghost" id="blogBackToList2">Cancel</button>
        <span class="cms-status" id="bStatus"></span>
      </div>
    </div>`;

  // ── Unsaved-changes guard ───────────────────────────────────────────────
  let dirty = false;
  const markDirty = () => { dirty = true; };
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  panel.addEventListener('input', markDirty); // title, excerpt, image/FAQ rows, …
  let editor = null; // set below by mountEditor()
  const leaveForm = () => {
    window.removeEventListener('beforeunload', beforeUnload);
    if (editor) editor.destroy();
  };
  const goBack = function() {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    leaveForm();
    renderBlogList(panel, view);
  };
  document.getElementById('blogBackToList').addEventListener('click', goBack);
  document.getElementById('blogBackToList2').addEventListener('click', goBack);

  // Auto-slug from title
  const titleEl = document.getElementById('bTitle');
  const slugEl  = document.getElementById('bSlug');
  if (!isEdit) {
    titleEl.addEventListener('input', function() {
      if (!slugEl._manuallyEdited) slugEl.value = makeSlug(titleEl.value);
    });
    slugEl.addEventListener('input', function() { slugEl._manuallyEdited = true; });
  }

  // ── Inline image rows ────────────────────────────────────────────────────
  const imageRowsEl = document.getElementById('bImageRows');
  let imageRows = biRows.length
    ? biRows.map(function(x) { return { num: x.Img_Number || '', url: x.Img_URL || '', alt: x.Img_Alt || '' }; })
    : [];

  function renderImageRows() {
    imageRowsEl.innerHTML = '';
    imageRows.forEach(function(ir, idx) {
      const row = document.createElement('div');
      row.className = 'cms-inline-row';
      row.innerHTML =
        '<span class="cms-inline-label">[img' + (idx + 1) + ']</span>' +
        '<input class="cms-input cms-inline-input" type="url" placeholder="Image URL" value="' + esc(ir.url) + '" data-field="url" />' +
        '<input class="cms-input cms-inline-input" type="text" placeholder="Alt text" value="' + esc(ir.alt) + '" data-field="alt" />' +
        '<button class="cms-btn cms-btn-danger cms-btn-xs" data-rm="' + idx + '" type="button">\u2715</button>';
      row.querySelector('[data-field="url"]').addEventListener('input', function(e) { imageRows[idx].url = e.target.value; });
      row.querySelector('[data-field="alt"]').addEventListener('input', function(e) { imageRows[idx].alt = e.target.value; });
      row.querySelector('[data-rm="' + idx + '"]').addEventListener('click', function() {
        imageRows.splice(idx, 1);
        renderImageRows();
      });
      imageRowsEl.appendChild(row);
    });
  }

  document.getElementById('bAddImage').addEventListener('click', function() {
    imageRows.push({ num: '', url: '', alt: '' });
    renderImageRows();
  });
  renderImageRows();

  // ── FAQ rows ─────────────────────────────────────────────────────────────
  const faqRowsEl = document.getElementById('bFaqRows');
  let faqItems = faqRows.length
    ? faqRows.map(function(x) { return { q: x.FAQ_Question || '', a: x.FAQ_Answer || '' }; })
    : [];

  function renderFaqRows() {
    faqRowsEl.innerHTML = '';
    faqItems.forEach(function(fq, idx) {
      const row = document.createElement('div');
      row.className = 'cms-inline-row cms-faq-row';
      row.innerHTML =
        '<div class="cms-faq-fields">' +
          '<input class="cms-input" type="text" placeholder="Question" value="' + esc(fq.q) + '" data-field="q" />' +
          '<textarea class="cms-input cms-textarea-sm" rows="2" placeholder="Answer">' + esc(fq.a) + '</textarea>' +
        '</div>' +
        '<button class="cms-btn cms-btn-danger cms-btn-xs" data-rm="' + idx + '" type="button">\u2715</button>';
      row.querySelector('[data-field="q"]').addEventListener('input', function(e) { faqItems[idx].q = e.target.value; });
      row.querySelector('textarea').addEventListener('input', function(e) { faqItems[idx].a = e.target.value; });
      row.querySelector('[data-rm="' + idx + '"]').addEventListener('click', function() {
        faqItems.splice(idx, 1);
        renderFaqRows();
      });
      faqRowsEl.appendChild(row);
    });
  }

  document.getElementById('bAddFaq').addEventListener('click', function() {
    faqItems.push({ q: '', a: '' });
    renderFaqRows();
  });
  renderFaqRows();

  // ── Editor (visual ⇄ Sheet format) ──────────────────────────────────────
  const wcEl = document.getElementById('bWC');
  const wysiwygEl = document.getElementById('bWysiwyg');
  const updateWC = () => {
    const words = (wysiwygEl.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    wcEl.textContent = words + ' word' + (words === 1 ? '' : 's');
  };
  editor = mountEditor({
    visual:  wysiwygEl,
    source:  document.getElementById('bMarkdown'),
    toolbar: document.getElementById('bToolbar'),
    content: r.Content || '',
    onChange: () => { markDirty(); updateWC(); },
    // next [imgN]: after the highest used in the text or the image rows
    nextImage: used => Math.max(0, imageRows.length, ...used) + 1,
  });
  updateWC();

  // ── Publish ──────────────────────────────────────────────────────────────
  const isHttp = u => /^https?:\/\/\S+$/i.test(u);
  document.getElementById('bPublish').addEventListener('click', async function() {
    const title    = document.getElementById('bTitle').value.trim();
    const slug     = isEdit ? r.Slug : (document.getElementById('bSlug').value.trim() || makeSlug(title));
    const date     = document.getElementById('bDate').value || today();
    const status   = document.getElementById('bStatusSel').value;
    const category = document.getElementById('bCategory').value.trim();
    const tags     = document.getElementById('bTags').value.trim();
    const excerpt  = document.getElementById('bExcerpt').value.trim();
    const imageUrl = document.getElementById('bImageUrl').value.trim();
    const imageAlt = document.getElementById('bImageAlt').value.trim();
    const content  = editor.getContent();   // exact Sheet format; unchanged if not edited

    const statusEl = document.getElementById('bStatus');
    const btn      = document.getElementById('bPublish');
    const fail = msg => {
      showToast(msg, 'error');
      statusEl.textContent = '✗ ' + msg;
      statusEl.style.color = '#991b1b';
      btn.disabled = false;
      btn.textContent = isEdit ? '💾 Save Changes' : 'Publish to Sheet →';
    };

    // ── Check everything BEFORE writing anything ──
    if (!title)   return fail('Title is required');
    if (!excerpt) return fail('Excerpt is required');
    if (!/^[a-z0-9][a-z0-9._~-]*$/i.test(slug)) return fail('Slug may only contain letters, numbers, - . _ ~');
    if (!isEdit && allRows.some(function(x) { return (x.Slug || '').trim() === slug; })) return fail('A post with this slug already exists');
    if (imageUrl && !isHttp(imageUrl)) return fail('Cover image URL must start with https://');
    const images = imageRows.filter(function(ir) { return ir.url.trim(); });
    const badImg = images.findIndex(function(ir) { return !isHttp(ir.url.trim()); });
    if (badImg !== -1) return fail('Inline image ' + (badImg + 1) + ': URL must start with https://');
    const faqs = faqItems.filter(function(f) { return f.q.trim(); });
    if (faqs.some(function(f) { return !f.a.trim(); })) return fail('Every FAQ question needs an answer');

    btn.disabled    = true;
    btn.textContent = isEdit ? 'Saving…' : 'Publishing…';
    statusEl.textContent = '';
    statusEl.style.color = '';

    const rowData = {
      ID: r.ID || '', Title: title, Slug: slug, Category: category, Excerpt: excerpt,
      Content: content, Date: date, Tags: tags, Image_URL: imageUrl, Image_Alt: imageAlt,
      Status: status,
    };

    try {
      const result = isEdit ? await apiUpdate('blog', r.Slug, rowData) : await apiAppend('blog', rowData);
      if (!result.ok) return fail(result.error || 'Save failed');

      // Images and FAQs: replace this post's rows. Report exactly what failed.
      const problems = [];
      if (isEdit && biRows.length) {
        const d = await apiDelete('blogimage', slug);
        if (!d.ok) problems.push('old images could not be removed (' + (d.error || 'error') + ')');
      }
      if (!problems.length) {
        for (let i = 0; i < images.length; i++) {
          const res = await apiAppend('blogimage', {
            Blog_Slug: slug, Img_Number: String(i + 1),
            Img_URL: images[i].url.trim(), Img_Alt: images[i].alt.trim(),
          });
          if (!res.ok) { problems.push('image ' + (i + 1) + ' (' + (res.error || 'error') + ')'); break; }
        }
      }
      let faqOk = true;
      if (isEdit && faqRows.length) {
        const d = await apiDelete('faq', slug);
        if (!d.ok) { faqOk = false; problems.push('old FAQs could not be removed (' + (d.error || 'error') + ')'); }
      }
      if (faqOk) {
        for (let i = 0; i < faqs.length; i++) {
          const res = await apiAppend('faq', {
            Blog_Slug: slug, FAQ_Number: String(i + 1),
            FAQ_Question: faqs[i].q.trim(), FAQ_Answer: faqs[i].a.trim(),
          });
          if (!res.ok) { problems.push('FAQ ' + (i + 1) + ' (' + (res.error || 'error') + ')'); break; }
        }
      }
      if (problems.length) {
        // The post itself is saved; stay on the form so nothing typed is lost.
        dirty = true;
        return fail('Post saved, but not: ' + problems.join('; ') + '. Click save again to retry.');
      }

      dirty = false;
      leaveForm();
      showToast(isEdit ? 'Post updated!' : (status ? 'Draft saved!' : 'Post published!'));
      renderBlogList(panel, view);
    } catch (e) {
      fail('Network error — nothing was lost, try again');
    }
  });
}
