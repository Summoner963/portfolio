// js/views/cms.js
// Content Studio — full CMS UI.
// LEFT pane  = plain-text / wysiwyg contenteditable (what visitors see)
// RIGHT pane = pipe-encoded raw source textarea (what's stored in Google Sheet)
//
// Storage format: lines are joined with "|" (same as chord tab_content).
// Markdown formatting is preserved inside each "|"-separated segment.
// pipesToLines()  →  converts "|" → "\n"  (for display/editing on left)
// linesTopipes()  →  converts "\n" → "|"  (for storage on right / in sheet)
//
// FIX 1: Dropdown menus can now be toggled closed on desktop.
// FIX 2: Toolbar is sticky on mobile so it stays visible while scrolling.
// FIX 3+4: Bidirectional sync between plain-text left and pipe-source right
//           is completely rewritten to be consistent and non-destructive.

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

async function apiRead(sheet) {
  const r = await fetch('/api/cms/read', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + getToken(),
    },
    body: JSON.stringify({ action: 'read', sheet }),
  });
  return r.json();
}

async function apiAppend(sheet, row) {
  const r = await fetch('/api/cms/write', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + getToken(),
    },
    body: JSON.stringify({ action: 'append', sheet, row }),
  });
  return r.json();
}

async function apiUpdate(sheet, slug, row, slugField) {
  if (!slugField) slugField = 'Slug';
  const r = await fetch('/api/cms/write', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + getToken(),
    },
    body: JSON.stringify({ action: 'update', sheet, slug, slugField, row }),
  });
  return r.json();
}

async function apiDelete(sheet, slug, slugField) {
  if (!slugField) slugField = 'Slug';
  const r = await fetch('/api/cms/write', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + getToken(),
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

// ── FIX 3/4: pipe ↔ newline converters ────────────────────────────────────
// These are used for BOTH chord tab content AND blog content.
// Blog content is stored as pipe-separated lines in the sheet.
// The left (WYSIWYG/plain) pane always works with newlines.
// The right (source) pane always works with pipes.

function linesTopipes(text) {
  if (!text) return '';
  // Collapse 3+ consecutive pipes to maximum 2 (paragraph break)
  return text
    .split('\n')
    .join('|')
    .replace(/\|{3,}/g, '||');
}

function pipesToLines(raw) {
  if (!raw) return '';
  return raw.split('|').join('\n');
}

function toInputDate(val) {
  if (!val) return today();
  const d = new Date(val);
  if (isNaN(d.getTime())) return today();
  return d.toISOString().split('T')[0];
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

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('cmsUser').value.trim();
    const password = document.getElementById('cmsPw').value;
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Signing in\u2026';
    errEl.hidden         = true;
    try {
      const result = await apiLogin(username, password);
      if (result.ok && result.token) {
        setToken(result.token);
        renderDashboard(view);
      } else {
        errEl.textContent    = result.error || 'Invalid credentials';
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
        <button class="cms-tab${activeTab === 'chords' ? ' active' : ''}"
          data-tab="chords" role="tab" aria-selected="${activeTab === 'chords'}">\uD83C\uDFB8 Chord Sheets</button>
      </div>
      <div class="cms-body">
        <div class="cms-panel" id="panel-blog"   ${activeTab !== 'blog'   ? 'hidden' : ''}></div>
        <div class="cms-panel" id="panel-chords" ${activeTab !== 'chords' ? 'hidden' : ''}></div>
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

  document.getElementById('cmsSignOut').addEventListener('click', function() {
    clearToken();
    renderLogin(view);
  });

  renderBlogList(document.getElementById('panel-blog'), view);
  renderChordList(document.getElementById('panel-chords'), view);
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
            Write on the left (plain text with line breaks). Right pane shows the pipe-encoded source stored in your Sheet — each line is separated by <code>|</code>. Both sides sync live and are fully editable.
          </span>
        </label>
        <div class="cms-toolbar" id="bToolbar" role="toolbar" aria-label="Formatting toolbar"></div>
        <div class="cms-editor-wrap">

          <!-- LEFT: plain-text / WYSIWYG contenteditable -->
          <div class="cms-editor-pane">
            <div class="cms-editor-label" id="bWysiwygLabel">
              <span>
                Write (plain text)
                <span class="cms-editor-label-badge wysiwyg">VISUAL</span>
              </span>
              <span class="cms-editor-wc" id="bWC">0 words</span>
            </div>
            <div
              class="cms-wysiwyg"
              id="bWysiwyg"
              contenteditable="true"
              spellcheck="true"
              data-placeholder="Write your blog post here\u2026 Use Enter for new lines."
            ></div>
          </div>

          <!-- RIGHT: pipe-encoded source -->
          <div class="cms-preview-pane">
            <div class="cms-editor-label" id="bMdLabel">
              <span>
                Source (pipe-encoded)
                <span class="cms-editor-label-badge markdown">RAW</span>
              </span>
            </div>
            <textarea
              class="cms-md-pane"
              id="bMarkdown"
              spellcheck="false"
              placeholder="Pipe-encoded source will appear here.&#10;Each | represents a line break.&#10;&#10;You can edit here directly too."
            ></textarea>
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

  const goBack = function() { renderBlogList(panel, view); };
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

  // ── WYSIWYG + Source bidirectional sync ───────────────────────────────────
  // LEFT  (wysiwygEl) = plain text, line breaks visible, what readers see
  // RIGHT (markdownEl) = pipe-encoded raw source stored in Sheet
  //
  // Conversion rules:
  //   left  → right : innerText of wysiwyg  → linesTopipes()
  //   right → left  : markdownEl.value       → pipesToLines() → set as innerText
  //
  // FIX: We no longer use md() / htmlToMd() for blog content because those
  // introduce HTML rendering that fights with the pipe↔newline encoding.
  // The left pane is purely a plain-text contenteditable, not a rich WYSIWYG.
  // This matches the user's requirement: left = plain text view, right = pipe source.

  const wysiwygEl  = document.getElementById('bWysiwyg');
  const markdownEl = document.getElementById('bMarkdown');
  const wcEl       = document.getElementById('bWC');
  const wLabel     = document.getElementById('bWysiwygLabel');
  const mLabel     = document.getElementById('bMdLabel');

  // ── Load existing content ─────────────────────────────────────────────
  // r.Content is stored as pipe-encoded. Decode to newlines for left pane.
  if (r.Content) {
    markdownEl.value = r.Content;                    // right = raw pipe source
    setWysiwygPlainText(wysiwygEl, pipesToLines(r.Content)); // left = decoded
  }

  updateWC();

  // Sync lock — prevents infinite loops between the two panes
  let _syncing = false;
  let _wysiwygTimer, _mdTimer;

  // ── LEFT (wysiwyg plain-text) → RIGHT (pipe source) ──────────────────
  wysiwygEl.addEventListener('input', function() {
    if (_syncing) return;
    clearTimeout(_wysiwygTimer);
    _wysiwygTimer = setTimeout(function() {
      _syncing = true;
      // Get plain text from contenteditable (innerText preserves line breaks)
      const plainText = wysiwygEl.innerText || '';
      // Normalise: trim trailing newline that browsers add in contenteditable
      const normalised = plainText.replace(/\n$/, '');
      markdownEl.value = linesTopipes(normalised);
      flashLabel(mLabel);
      updateWC();
      _syncing = false;
    }, 200);
  });

  // ── RIGHT (pipe source) → LEFT (plain-text wysiwyg) ──────────────────
  markdownEl.addEventListener('input', function() {
    if (_syncing) return;
    clearTimeout(_mdTimer);
    _mdTimer = setTimeout(function() {
      _syncing = true;
      const scrollTop = wysiwygEl.scrollTop;
      // Decode pipes → newlines and push to left pane
      setWysiwygPlainText(wysiwygEl, pipesToLines(markdownEl.value));
      wysiwygEl.scrollTop = scrollTop;
      flashLabel(wLabel);
      updateWC();
      _syncing = false;
    }, 200);
  });

  function updateWC() {
    if (!wcEl) return;
    const text  = wysiwygEl.innerText || wysiwygEl.textContent || '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    wcEl.textContent = words + ' word' + (words === 1 ? '' : 's');
  }

  function flashLabel(labelEl) {
    if (!labelEl) return;
    labelEl.classList.add('syncing');
    setTimeout(function() { labelEl.classList.remove('syncing'); }, 400);
  }

  // ── Toolbar ──────────────────────────────────────────────────────────────
  // Pass both panes so toolbar buttons can insert text and sync
  buildWysiwygToolbar(
    document.getElementById('bToolbar'),
    wysiwygEl,
    markdownEl
  );

  // ── Publish ──────────────────────────────────────────────────────────────
  document.getElementById('bPublish').addEventListener('click', async function() {
    const title    = document.getElementById('bTitle').value.trim();
    const slug     = document.getElementById('bSlug').value.trim() || makeSlug(title);
    const date     = document.getElementById('bDate').value || today();
    const category = document.getElementById('bCategory').value.trim();
    const tags     = document.getElementById('bTags').value.trim();
    const excerpt  = document.getElementById('bExcerpt').value.trim();
    const imageUrl = document.getElementById('bImageUrl').value.trim();
    const imageAlt = document.getElementById('bImageAlt').value.trim();

    // Always save from the right (pipe-source) pane — that's the stored format
    const content  = markdownEl.value;

    const statusEl = document.getElementById('bStatus');
    const btn      = document.getElementById('bPublish');

    if (!title)   { showToast('Title is required',   'error'); return; }
    if (!excerpt) { showToast('Excerpt is required', 'error'); return; }

    btn.disabled    = true;
    btn.textContent = isEdit ? 'Saving\u2026' : 'Publishing\u2026';
    statusEl.textContent = '';

    const rowData = {
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
      const result = isEdit
        ? await apiUpdate('blog', r.Slug, rowData)
        : await apiAppend('blog', rowData);

      if (!result.ok) {
        showToast(result.error || 'Save failed', 'error');
        statusEl.textContent = '\u2717 ' + (result.error || 'Error');
        statusEl.style.color = '#991b1b';
        btn.disabled    = false;
        btn.textContent = isEdit ? '\uD83D\uDCBE Save Changes' : 'Publish to Sheet \u2192';
        return;
      }

      // Save blogimage rows
      if (isEdit && biRows.length) {
        await apiDelete('blogimage', slug, 'Blog_Slug');
      }
      for (let i = 0; i < imageRows.length; i++) {
        if (imageRows[i].url) {
          await apiAppend('blogimage', {
            Blog_Slug:  slug,
            Img_Number: String(i + 1),
            Img_URL:    imageRows[i].url,
            Img_Alt:    imageRows[i].alt,
          });
        }
      }

      // Save FAQ rows
      if (isEdit && faqRows.length) {
        await apiDelete('faq', slug, 'Blog_Slug');
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
      renderBlogList(panel, view);

    } catch (e) {
      showToast('Network error', 'error');
      btn.disabled    = false;
      btn.textContent = isEdit ? '\uD83D\uDCBE Save Changes' : 'Publish to Sheet \u2192';
    }
  });
}

// ── setWysiwygPlainText ────────────────────────────────────────────────────
// Safely set plain text content into a contenteditable div.
// We use innerText assignment which preserves \n as visible line breaks
// without injecting any HTML that could corrupt the pipe sync.
function setWysiwygPlainText(el, text) {
  // innerText setter on contenteditable correctly renders \n as line breaks
  // in all modern browsers.
  el.innerText = text;
}

// ── CHORD LIST ─────────────────────────────────────────────────────────────

async function renderChordList(panel, view) {
  panel.innerHTML = `
    <div class="cms-list-wrap">
      <div class="cms-list-header">
        <h3 class="cms-form-title">Chord Sheets</h3>
        <button class="cms-btn cms-btn-primary" id="chordAddNew">+ Add New Chord Sheet</button>
      </div>
      <div class="cms-list-toolbar">
        <input class="cms-input cms-list-search" id="chordListSearch"
          type="search" placeholder="Search songs, artists\u2026" autocomplete="off" />
        <select class="cms-input cms-select cms-list-sort" id="chordListSort">
          <option value="newest">Newest first</option>
          <option value="az">Title A\u2013Z</option>
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
        <div class="cms-list-loading">Loading chord sheets\u2026</div>
      </div>
    </div>`;

  document.getElementById('chordAddNew').addEventListener('click', function() {
    renderChordForm(panel, view, null);
  });

  let rows = [];
  try {
    const result = await apiRead('chords');
    if (result.ok) {
      rows = result.rows || [];
    } else {
      document.getElementById('chordListBody').innerHTML =
        '<div class="cms-list-empty">Error loading chord sheets: ' + esc(result.error || 'Unknown error') + '</div>';
      return;
    }
  } catch (e) {
    document.getElementById('chordListBody').innerHTML =
      '<div class="cms-list-empty">Network error loading chord sheets.</div>';
    return;
  }

  function renderList() {
    const search = (document.getElementById('chordListSearch') ? document.getElementById('chordListSearch').value : '').toLowerCase();
    const sort   = document.getElementById('chordListSort')   ? document.getElementById('chordListSort').value   : 'newest';
    const diff   = (document.getElementById('chordListDiff')  ? document.getElementById('chordListDiff').value   : '').toLowerCase();

    let filtered = rows.filter(function(r) {
      return (!search ||
        (r.Title  || '').toLowerCase().includes(search) ||
        (r.Artist || '').toLowerCase().includes(search)) &&
        (!diff || (r.Difficulty || '').toLowerCase() === diff);
    });

    filtered.sort(function(a, b) {
      if (sort === 'newest') return new Date(b.Date_Added || 0) - new Date(a.Date_Added || 0);
      if (sort === 'az')     return (a.Title  || '').localeCompare(b.Title  || '');
      if (sort === 'artist') return (a.Artist || '').localeCompare(b.Artist || '');
      return 0;
    });

    const body = document.getElementById('chordListBody');
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = '<div class="cms-list-empty">' +
        (rows.length ? 'No chord sheets match your search.' : 'No chord sheets yet. Click "Add New" to create one.') +
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
            '<span class="cms-list-badge">' + esc(row.Artist || '') + '</span>' +
            (row.Key        ? '<span class="cms-list-badge">Key ' + esc(row.Key) + '</span>' : '') +
            (row.Difficulty ? '<span class="cms-list-badge">' + esc(row.Difficulty) + '</span>' : '') +
            (row.Date_Added ? '<span class="cms-list-date">' + esc(row.Date_Added) + '</span>' : '') +
          '</span>' +
        '</div>' +
        '<div class="cms-list-item-actions">' +
          '<button class="cms-btn cms-btn-ghost cms-btn-sm" data-action="edit">Edit</button>' +
          '<button class="cms-btn cms-btn-danger cms-btn-sm" data-action="delete">Delete</button>' +
        '</div>';

      item.querySelector('[data-action="edit"]').addEventListener('click', function() {
        renderChordForm(panel, view, row);
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', async function() {
        if (!confirm('Delete "' + row.Title + '"? This cannot be undone.')) return;
        const res = await apiDelete('chords', row.Slug);
        if (res.ok) {
          showToast('Chord sheet deleted');
          rows = rows.filter(function(x) { return x.Slug !== row.Slug; });
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

// ── CHORD FORM ─────────────────────────────────────────────────────────────
// (Unchanged — chord tab uses plain monospace format, not WYSIWYG)

function renderChordForm(panel, view, existingRow) {
  const isEdit = !!existingRow;
  const r      = existingRow || {};

  const keys = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B',
                 'Cm','Dm','Em','Am','Fm','Gm'];

  function selOpt(val, opt) { return val === opt ? ' selected' : ''; }

  const keyOptions = '<option value="">-- select --</option>' +
    keys.map(function(k) {
      return '<option value="' + esc(k) + '"' + (r.Key === k ? ' selected' : '') + '>' + esc(k) + '</option>';
    }).join('');

  panel.innerHTML = `
    <div class="cms-form-wrap">
      <div class="cms-form-topbar">
        <button class="cms-btn cms-btn-ghost cms-btn-sm" id="chordBackToList">\u2190 All Chord Sheets</button>
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
            <option value="beginner"${selOpt(r.Difficulty,'beginner')}>Beginner</option>
            <option value="intermediate"${selOpt(r.Difficulty,'intermediate') || (!r.Difficulty ? ' selected' : '')}>Intermediate</option>
            <option value="advanced"${selOpt(r.Difficulty,'advanced')}>Advanced</option>
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Category</label>
          <select class="cms-input cms-select" id="cCategory">
            ${['nepali','english','hindi','devotional','folk','pop','rock','classical'].map(function(c) {
              return '<option value="' + c + '"' + selOpt(r.Category, c) + '>' + c.charAt(0).toUpperCase() + c.slice(1) + '</option>';
            }).join('')}
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Featured</label>
          <select class="cms-input cms-select" id="cFeatured">
            <option value="false"${selOpt(r.Featured,'false') || (!r.Featured ? ' selected' : '')}>No</option>
            <option value="true"${selOpt(r.Featured,'true')}>Yes</option>
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
          <input class="cms-input" id="cDate" type="date" value="${esc(toInputDate(r.Date_Added))}" />
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
          placeholder="Learn to play this song with G Em7 Cadd9 chords\u2026">${esc(r.Excerpt || '')}</textarea>
      </div>
      <div class="cms-field">
        <label class="cms-label">Tab Content
          <span class="cms-label-hint">
            Press Enter for new line, blank line for section gap.
            Chords in [brackets]: [G]hey its me [C]here
            Section labels on own line: [Verse 1] or [Chorus]
          </span>
        </label>
        <div class="cms-editor-wrap">
          <div class="cms-editor-pane">
            <div class="cms-editor-label">Write</div>
            <textarea class="cms-input cms-editor cms-editor-mono"
              id="cTabContent" rows="22" spellcheck="false"
              placeholder="[Verse 1]&#10;[G]Hey its me&#10;[C]here with you&#10;&#10;[Chorus]&#10;[G]This is the [Em]chorus"></textarea>
          </div>
          <div class="cms-preview-pane">
            <div class="cms-editor-label">Preview</div>
            <div class="cms-preview cms-tab-preview" id="cTabPreview"></div>
          </div>
        </div>
      </div>
      <div class="cms-actions">
        <button class="cms-btn cms-btn-primary" id="cPublish">
          ${isEdit ? '\uD83D\uDCBE Save Changes' : 'Publish to Sheet \u2192'}
        </button>
        <button class="cms-btn cms-btn-ghost" id="chordBackToList2">Cancel</button>
        <span class="cms-status" id="cStatus"></span>
      </div>
    </div>`;

  const tabEl = document.getElementById('cTabContent');
  if (r.Tab_Content) tabEl.value = pipesToLines(r.Tab_Content);

  const goBack = function() { renderChordList(panel, view); };
  document.getElementById('chordBackToList').addEventListener('click', goBack);
  document.getElementById('chordBackToList2').addEventListener('click', goBack);

  const titleEl = document.getElementById('cTitle');
  const slugEl  = document.getElementById('cSlug');
  if (!isEdit) {
    titleEl.addEventListener('input', function() {
      if (!slugEl._manuallyEdited) slugEl.value = makeSlug(titleEl.value);
    });
    slugEl.addEventListener('input', function() { slugEl._manuallyEdited = true; });
  }

  const previewEl = document.getElementById('cTabPreview');
  let previewTimer;

  function updateTabPreview() {
    previewEl.innerHTML = renderTabPreview(tabEl.value);
  }

  tabEl.addEventListener('input', function() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updateTabPreview, 300);
  });

  if (tabEl.value) updateTabPreview();

  document.getElementById('cPublish').addEventListener('click', async function() {
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
    const tabContent = linesTopipes(tabEl.value);
    const statusEl   = document.getElementById('cStatus');
    const btn        = document.getElementById('cPublish');

    if (!title)  { showToast('Title is required',  'error'); return; }
    if (!artist) { showToast('Artist is required', 'error'); return; }

    btn.disabled    = true;
    btn.textContent = isEdit ? 'Saving\u2026' : 'Publishing\u2026';
    statusEl.textContent = '';

    const rowData = {
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
        ? await apiUpdate('chords', r.Slug, rowData)
        : await apiAppend('chords', rowData);

      if (result.ok) {
        showToast(isEdit ? 'Chord sheet updated!' : 'Chord sheet published!');
        renderChordList(panel, view);
      } else {
        showToast(result.error || 'Save failed', 'error');
        statusEl.textContent = '\u2717 ' + (result.error || 'Error');
        statusEl.style.color = '#991b1b';
        btn.disabled    = false;
        btn.textContent = isEdit ? '\uD83D\uDCBE Save Changes' : 'Publish to Sheet \u2192';
      }
    } catch (e) {
      showToast('Network error', 'error');
      btn.disabled    = false;
      btn.textContent = isEdit ? '\uD83D\uDCBE Save Changes' : 'Publish to Sheet \u2192';
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  WYSIWYG TOOLBAR
//  FIX 1: Dropdown menus now properly toggle (close when clicking the same
//          button again) and close when clicking outside — on BOTH desktop and
//          mobile. The previous code called e.stopPropagation() on button
//          clicks which prevented the document click handler from ever firing
//          on the same click that opened the menu, so menus could never close
//          via the outside-click path. The fix: track "just opened" state so
//          the document handler knows to skip the first click, allowing the
//          second outside click to close normally. Also we no longer leak
//          stale document-level close handlers across re-renders.
// ══════════════════════════════════════════════════════════════════════════════

const COLORS = ['#2d6a4f','#1b4332','#e63946','#f4a261','#457b9d','#6d6875','#000000','#ffffff'];
const CALLOUT_TYPES = ['note','tip','warning','important','info'];
const SPECIAL_CHARS = [
  '\u2014','\u2013','\u2026',
  '\u201C','\u201D','\u2018','\u2019','\u00AB','\u00BB',
  '\u00A9','\u00AE','\u2122',
  '\u2192','\u2190','\u2191','\u2193',
  '\u2713','\u2717',
  '\u2022','\u00B7','\u00B0',
  '\u2116','\u20B9','\u20AC','\u00A3',
];

// Global registry of open popups — only one open at a time
let _openPopup = null;       // { menu: HTMLElement, btn: HTMLElement }
let _justOpened = false;     // skip the same click that opens a menu

function closeOpenPopup() {
  if (_openPopup) {
    _openPopup.menu.hidden = true;
    _openPopup = null;
  }
}

// Single document-level listener (attached once, never duplicated)
if (!window._cmsPopupListenerAttached) {
  window._cmsPopupListenerAttached = true;
  document.addEventListener('click', function() {
    if (_justOpened) { _justOpened = false; return; }
    closeOpenPopup();
  });
}

function togglePopup(menu, btn) {
  if (_openPopup && _openPopup.menu === menu) {
    // Same button clicked again → close
    closeOpenPopup();
    return;
  }
  closeOpenPopup();
  menu.hidden = false;
  _openPopup  = { menu, btn };
  _justOpened = true; // prevent the current click from immediately closing it
}

function buildWysiwygToolbar(toolbar, wysiwygEl, markdownEl) {
  toolbar.innerHTML = '';

  // Saved selection — we lose focus when clicking toolbar buttons,
  // so we capture it on mousedown
  let _savedRange = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!_savedRange) { wysiwygEl.focus(); return; }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedRange);
  }

  // Capture selection before toolbar button steals focus
  toolbar.addEventListener('mousedown', function(e) {
    if (e.target.closest('button, input[type="color"]')) {
      saveSelection();
    }
  });

  // After any edit, push pipe-source to right pane
  function afterEdit() {
    // For plain-text left pane: sync innerText → linesTopipes → markdownEl
    const plainText = wysiwygEl.innerText || '';
    const normalised = plainText.replace(/\n$/, '');
    markdownEl.value = linesTopipes(normalised);
    wysiwygEl.dispatchEvent(new Event('input', { bubbles: true }));
    updateToolbarState();
  }

  // ── execCommand wrapper ──────────────────────────────────────────────────
  function exec(cmd, value) {
    restoreSelection();
    wysiwygEl.focus();
    document.execCommand(cmd, false, value || null);
    afterEdit();
  }

  // ── Heading ──────────────────────────────────────────────────────────────
  function applyHeading(tag) {
    restoreSelection();
    wysiwygEl.focus();
    if (tag === 'p' || tag === '') {
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand('formatBlock', false, tag);
    }
    afterEdit();
  }

  // ── Insert HTML at cursor ────────────────────────────────────────────────
  function insertHTML(html) {
    restoreSelection();
    wysiwygEl.focus();
    document.execCommand('insertHTML', false, html);
    afterEdit();
  }

  // ── Insert img placeholder chip ──────────────────────────────────────────
  function insertImgPlaceholder() {
    restoreSelection();
    const existing = wysiwygEl.querySelectorAll('.img-placeholder');
    const num = existing.length + 1;
    const placeholder = '[img' + num + ']';
    const chip = '<span class="img-placeholder" contenteditable="false" data-placeholder="' +
      placeholder + '">\uD83D\uDDBC\uFE0F ' + placeholder + '</span>&nbsp;';
    insertHTML(chip);
  }

  // ── Separator ────────────────────────────────────────────────────────────
  function addSep() {
    const s = document.createElement('span');
    s.className = 'cms-tb-sep';
    toolbar.appendChild(s);
  }

  // ── 1. Heading / paragraph dropdown ─────────────────────────────────────
  const sizeWrap = document.createElement('div');
  sizeWrap.className = 'tb-dropdown-wrap';

  const sizeBtn = document.createElement('button');
  sizeBtn.type      = 'button';
  sizeBtn.className = 'cms-tb-btn tb-size-btn';
  sizeBtn.innerHTML = '<span class="tb-size-label">Paragraph</span><span class="tb-caret">▾</span>';

  const sizeMenu = document.createElement('div');
  sizeMenu.className = 'tb-dropdown-menu';
  sizeMenu.hidden    = true;

  const headingOpts = [
    { label: 'Paragraph', tag: 'p',  cls: 'tb-size-p'  },
    { label: 'Heading 1', tag: 'h1', cls: 'tb-size-h1' },
    { label: 'Heading 2', tag: 'h2', cls: 'tb-size-h2' },
    { label: 'Heading 3', tag: 'h3', cls: 'tb-size-h3' },
    { label: 'Heading 4', tag: 'h4', cls: 'tb-size-h4' },
  ];

  headingOpts.forEach(function(opt) {
    const item = document.createElement('button');
    item.type        = 'button';
    item.className   = 'tb-dropdown-item ' + opt.cls;
    item.textContent = opt.label;
    item.addEventListener('mousedown', function(e) { e.preventDefault(); });
    item.addEventListener('click', function() {
      applyHeading(opt.tag);
      closeOpenPopup();
      sizeBtn.querySelector('.tb-size-label').textContent = opt.label;
    });
    sizeMenu.appendChild(item);
  });

  sizeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePopup(sizeMenu, sizeBtn);
  });

  sizeWrap.appendChild(sizeBtn);
  sizeWrap.appendChild(sizeMenu);
  toolbar.appendChild(sizeWrap);
  addSep();

  // ── 2. Inline format group: B I S ` ─────────────────────────────────────
  const inlineGroup = document.createElement('div');
  inlineGroup.className = 'tb-btn-group';

  const inlineBtns = [
    { label: 'B',  title: 'Bold',          cmd: 'bold',          cls: 'tb-bold',   id: 'tb-bold'   },
    { label: 'I',  title: 'Italic',        cmd: 'italic',        cls: 'tb-italic', id: 'tb-italic' },
    { label: 'S',  title: 'Strikethrough', cmd: 'strikeThrough', cls: 'tb-strike', id: 'tb-strike' },
    { label: '`',  title: 'Inline code',   cmd: null,            cls: '',           id: 'tb-code'   },
  ];

  inlineBtns.forEach(function(b) {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'cms-tb-btn' + (b.cls ? ' ' + b.cls : '');
    btn.title       = b.title;
    btn.id          = b.id;
    btn.innerHTML   = '<span>' + b.label + '</span>';

    btn.addEventListener('mousedown', function(e) { e.preventDefault(); });
    btn.addEventListener('click', function() {
      if (b.cmd) {
        exec(b.cmd);
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          restoreSelection();
          wysiwygEl.focus();
          const text = sel.toString();
          document.execCommand('insertHTML', false, '<code>' + text + '</code>');
          afterEdit();
        }
      }
    });
    inlineGroup.appendChild(btn);
  });
  toolbar.appendChild(inlineGroup);
  addSep();

  // ── 3. Block format group ────────────────────────────────────────────────
  const blockGroup = document.createElement('div');
  blockGroup.className = 'tb-btn-group';

  [
    { label: '❝',   title: 'Blockquote', fn: function() { exec('formatBlock', 'blockquote'); } },
    { label: '```', title: 'Code block', fn: function() {
        insertHTML('<pre><code>code here</code></pre><p><br></p>');
    }},
    { label: '—',   title: 'Divider',    fn: function() { insertHTML('<hr><p><br></p>'); } },
  ].forEach(function(b) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'cms-tb-btn';
    btn.title     = b.title;
    btn.innerHTML = '<span>' + b.label + '</span>';
    btn.addEventListener('mousedown', function(e) { e.preventDefault(); });
    btn.addEventListener('click', b.fn);
    blockGroup.appendChild(btn);
  });
  toolbar.appendChild(blockGroup);
  addSep();

  // ── 4. List group ────────────────────────────────────────────────────────
  const listGroup = document.createElement('div');
  listGroup.className = 'tb-btn-group';

  [
    { label: '•',  title: 'Bullet list',   cmd: 'insertUnorderedList' },
    { label: '1.', title: 'Numbered list', cmd: 'insertOrderedList'   },
  ].forEach(function(b) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'cms-tb-btn';
    btn.title     = b.title;
    btn.innerHTML = '<span>' + b.label + '</span>';
    btn.addEventListener('mousedown', function(e) { e.preventDefault(); });
    btn.addEventListener('click', function() { exec(b.cmd); });
    listGroup.appendChild(btn);
  });
  toolbar.appendChild(listGroup);
  addSep();

  // ── 5. Insert group ───────────────────────────────────────────────────────
  const insertGroup = document.createElement('div');
  insertGroup.className = 'tb-btn-group';

  const linkBtn = document.createElement('button');
  linkBtn.type      = 'button';
  linkBtn.className = 'cms-tb-btn';
  linkBtn.title     = 'Insert link';
  linkBtn.innerHTML = '<span>\uD83D\uDD17</span>';
  linkBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
  linkBtn.addEventListener('click', function() {
    saveSelection();
    const sel = window.getSelection();
    const defaultText = (sel && !sel.isCollapsed) ? '' : 'link text';
    const url = prompt('Enter URL:');
    if (!url) return;
    restoreSelection();
    wysiwygEl.focus();
    if (sel && !sel.isCollapsed) {
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand('insertHTML', false,
        '<a href="' + url + '">' + (defaultText || url) + '</a>');
    }
    afterEdit();
  });
  insertGroup.appendChild(linkBtn);

  const imgBtn = document.createElement('button');
  imgBtn.type      = 'button';
  imgBtn.className = 'cms-tb-btn';
  imgBtn.title     = 'Insert image placeholder';
  imgBtn.innerHTML = '<span>[img]</span>';
  imgBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
  imgBtn.addEventListener('click', insertImgPlaceholder);
  insertGroup.appendChild(imgBtn);

  toolbar.appendChild(insertGroup);
  addSep();

  // ── 6. Callout dropdown ───────────────────────────────────────────────────
  const calloutWrap = document.createElement('div');
  calloutWrap.className = 'tb-dropdown-wrap';

  const calloutBtn = document.createElement('button');
  calloutBtn.type      = 'button';
  calloutBtn.className = 'cms-tb-btn';
  calloutBtn.innerHTML = '<span>Callout \u25BE</span>';

  const calloutMenu = document.createElement('div');
  calloutMenu.className = 'tb-dropdown-menu tb-callout-menu';
  calloutMenu.hidden    = true;

  CALLOUT_TYPES.forEach(function(type) {
    const item = document.createElement('button');
    item.type        = 'button';
    item.className   = 'tb-dropdown-item tb-callout-' + type;
    item.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    item.addEventListener('mousedown', function(e) { e.preventDefault(); });
    item.addEventListener('click', function() {
      const icons = { note:'📝', tip:'💡', warning:'⚠️', important:'🚨', info:'ℹ️' };
      const html =
        '<div class="callout callout-' + type + '" contenteditable="false">' +
          '<div class="callout-header">' + (icons[type] || '') + ' ' + type.toUpperCase() + '</div>' +
          '<div class="callout-body" contenteditable="true"><p>Your ' + type + ' text here</p></div>' +
        '</div><p><br></p>';
      insertHTML(html);
      closeOpenPopup();
    });
    calloutMenu.appendChild(item);
  });

  calloutBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePopup(calloutMenu, calloutBtn);
  });

  calloutWrap.appendChild(calloutBtn);
  calloutWrap.appendChild(calloutMenu);
  toolbar.appendChild(calloutWrap);
  addSep();

  // ── 7. Colour picker ─────────────────────────────────────────────────────
  const colorWrap = document.createElement('div');
  colorWrap.className = 'tb-dropdown-wrap';

  let activeColor = COLORS[0];

  const colorBtn = document.createElement('button');
  colorBtn.type      = 'button';
  colorBtn.className = 'cms-tb-btn tb-color-btn';
  colorBtn.innerHTML =
    '<span class="tb-color-swatch-preview" style="background:' + activeColor + '"></span>' +
    '<span>Color</span>';

  const colorPanel = document.createElement('div');
  colorPanel.className = 'tb-color-panel';
  colorPanel.hidden    = true;

  const swatchRow = document.createElement('div');
  swatchRow.className = 'tb-swatch-row';
  COLORS.forEach(function(c) {
    const sw = document.createElement('button');
    sw.type        = 'button';
    sw.className   = 'tb-swatch' + (c === '#ffffff' ? ' tb-swatch-light' : '');
    sw.style.background = c;
    sw.title       = c;
    sw.addEventListener('mousedown', function(e) { e.preventDefault(); });
    sw.addEventListener('click', function() {
      activeColor = c;
      colorBtn.querySelector('.tb-color-swatch-preview').style.background = activeColor;
      closeOpenPopup();
      exec('foreColor', activeColor);
    });
    swatchRow.appendChild(sw);
  });
  colorPanel.appendChild(swatchRow);

  const customRow = document.createElement('div');
  customRow.className = 'tb-custom-color-row';
  const customLabel   = document.createElement('label');
  customLabel.className   = 'tb-custom-label';
  customLabel.textContent = 'Custom:';
  const customInput = document.createElement('input');
  customInput.type  = 'color';
  customInput.value = activeColor;
  customInput.className = 'tb-custom-color-input';
  customInput.addEventListener('input', function(e) {
    activeColor = e.target.value;
    colorBtn.querySelector('.tb-color-swatch-preview').style.background = activeColor;
  });
  customInput.addEventListener('change', function(e) {
    activeColor = e.target.value;
    closeOpenPopup();
    exec('foreColor', activeColor);
  });
  customRow.appendChild(customLabel);
  customRow.appendChild(customInput);
  colorPanel.appendChild(customRow);

  colorBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePopup(colorPanel, colorBtn);
  });

  colorWrap.appendChild(colorBtn);
  colorWrap.appendChild(colorPanel);
  toolbar.appendChild(colorWrap);
  addSep();

  // ── 8. Special characters ────────────────────────────────────────────────
  const specialWrap = document.createElement('div');
  specialWrap.className = 'tb-dropdown-wrap';

  const specialBtn = document.createElement('button');
  specialBtn.type      = 'button';
  specialBtn.className = 'cms-tb-btn';
  specialBtn.innerHTML = '<span>\u03A9</span>';
  specialBtn.title     = 'Special characters';

  const specialPanel = document.createElement('div');
  specialPanel.className = 'tb-special-panel';
  specialPanel.hidden    = true;

  SPECIAL_CHARS.forEach(function(ch) {
    const b = document.createElement('button');
    b.type        = 'button';
    b.className   = 'tb-special-char';
    b.textContent = ch;
    b.title       = ch;
    b.addEventListener('mousedown', function(e) { e.preventDefault(); });
    b.addEventListener('click', function(e) {
      e.stopPropagation();
      restoreSelection();
      wysiwygEl.focus();
      document.execCommand('insertText', false, ch);
      closeOpenPopup();
      afterEdit();
    });
    specialPanel.appendChild(b);
  });

  specialBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePopup(specialPanel, specialBtn);
  });

  specialWrap.appendChild(specialBtn);
  specialWrap.appendChild(specialPanel);
  toolbar.appendChild(specialWrap);

  // ── Toolbar active state ──────────────────────────────────────────────────
  function updateToolbarState() {
    try {
      const btnBold   = document.getElementById('tb-bold');
      const btnItalic = document.getElementById('tb-italic');
      const btnStrike = document.getElementById('tb-strike');
      if (btnBold)   btnBold.classList.toggle('active',   document.queryCommandState('bold'));
      if (btnItalic) btnItalic.classList.toggle('active', document.queryCommandState('italic'));
      if (btnStrike) btnStrike.classList.toggle('active', document.queryCommandState('strikeThrough'));
    } catch(e) {}
  }

  wysiwygEl.addEventListener('keyup',    updateToolbarState);
  wysiwygEl.addEventListener('mouseup',  updateToolbarState);
  wysiwygEl.addEventListener('selectionchange', updateToolbarState);
}


// ── CHORD TAB PREVIEW ──────────────────────────────────────────────────────

const CHORD_RE_PREVIEW = /^[A-G][#b]?(maj7|maj|min7|min|m7|m|7|sus2|sus4|add9|dim7|dim|aug|5)?$/;

function renderTabPreview(raw) {
  if (!raw) return '<span style="color:var(--muted-light)">Preview will appear here\u2026</span>';

  return raw.split('\n').map(function(line) {
    const trimmed = line.trim();
    if (!trimmed) return '<div style="height:.6rem"></div>';

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && !CHORD_RE_PREVIEW.test(sectionMatch[1])) {
      return '<div style="font-family:var(--serif);font-weight:500;color:var(--accent2);margin:.8rem 0 .2rem">' + esc(sectionMatch[1]) + '</div>';
    }

    const parts = line.split(/(\[[^\]]+\])/);
    if (parts.length > 1) {
      const spans = parts.map(function(part) {
        const m = part.match(/^\[([^\]]+)\]$/);
        if (m && CHORD_RE_PREVIEW.test(m[1])) {
          return '<span style="color:var(--accent);font-weight:600">' + esc(m[1]) + '</span>';
        }
        return esc(part);
      });
      return '<div style="font-family:var(--mono);font-size:.82rem;line-height:2">' + spans.join('') + '</div>';
    }

    return '<div style="font-family:var(--mono);font-size:.82rem;line-height:1.7;color:var(--text)">' + esc(line) + '</div>';
  }).join('');
}