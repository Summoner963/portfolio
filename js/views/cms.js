// js/views/cms.js
// Complete CMS UI — login + dashboard for blog posts and chord sheets.

import { esc, loadCSS, showToast, md } from '../utils.js';

const SESSION_KEY = 'sd_cms_token';

async function getToken() {
  return sessionStorage.getItem(SESSION_KEY);
}

async function setToken(t) {
  sessionStorage.setItem(SESSION_KEY, t);
}

async function clearToken() {
  sessionStorage.removeItem(SESSION_KEY);
}

async function isLoggedIn() {
  return !!sessionStorage.getItem(SESSION_KEY);
}

// ── API helpers ────────────────────────────────────────────────────────────

async function apiLogin(username, password) {
  const r = await fetch('/api/cms/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

async function apiWrite(sheet, row) {
  const token = await getToken();
  const r = await fetch('/api/cms/write', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ sheet, row }),
  });
  return r.json();
}

// ── Slug generator ─────────────────────────────────────────────────────────

function makeSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ── Today's date ──────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function renderCMS() {
  await loadCSS('/css/cms.css');

  const view = document.getElementById('view-cms');
  if (!view) return;

  if (await isLoggedIn()) {
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
              name="username" autocomplete="username"
              required placeholder="your username" />
          </div>
          <div class="cms-field">
            <label class="cms-label" for="cmsPw">Password</label>
            <input class="cms-input" type="password" id="cmsPw"
              name="password" autocomplete="current-password"
              required placeholder="••••••••" />
          </div>
          <div class="cms-login-error" id="cmsLoginError" hidden></div>
          <button class="cms-btn cms-btn-primary" type="submit" id="cmsLoginBtn">
            Sign in
          </button>
        </form>
      </div>
    </div>`;

  const form    = document.getElementById('cmsLoginForm');
  const errEl   = document.getElementById('cmsLoginError');
  const loginBtn = document.getElementById('cmsLoginBtn');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('cmsUser').value.trim();
    const password = document.getElementById('cmsPw').value;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';
    errEl.hidden = true;

    try {
      const result = await apiLogin(username, password);
      if (result.ok && result.token) {
        await setToken(result.token);
        renderDashboard(view);
      } else {
        errEl.textContent = result.error || 'Invalid credentials';
        errEl.hidden = false;
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in';
      }
    } catch {
      errEl.textContent = 'Network error — try again';
      errEl.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
    }
  });
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────

function renderDashboard(view) {
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
        <button class="cms-btn cms-btn-ghost cms-signout" id="cmsSignOut">
          Sign out
        </button>
      </header>

      <div class="cms-tabs" role="tablist">
        <button class="cms-tab active" data-tab="blog" role="tab"
          aria-selected="true">📝 Blog Post</button>
        <button class="cms-tab" data-tab="chords" role="tab"
          aria-selected="false">🎸 Chord Sheet</button>
      </div>

      <div class="cms-body">
        <div class="cms-panel" id="panel-blog"></div>
        <div class="cms-panel" id="panel-chords" hidden></div>
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
  document.getElementById('cmsSignOut').addEventListener('click', async () => {
    await clearToken();
    renderLogin(view);
  });

  // Render both forms
  renderBlogForm(document.getElementById('panel-blog'));
  renderChordsForm(document.getElementById('panel-chords'));
}

// ── BLOG FORM ─────────────────────────────────────────────────────────────

function renderBlogForm(container) {
  container.innerHTML = `
    <div class="cms-form-wrap">
      <h3 class="cms-form-title">New Blog Post</h3>

      <div class="cms-row">
        <div class="cms-field cms-field-wide">
          <label class="cms-label">Title *</label>
          <input class="cms-input" id="bTitle" type="text"
            placeholder="My awesome blog post" required />
        </div>
        <div class="cms-field">
          <label class="cms-label">Slug</label>
          <input class="cms-input" id="bSlug" type="text"
            placeholder="auto-generated" />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Date</label>
          <input class="cms-input" id="bDate" type="date" value="${today()}" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Category</label>
          <input class="cms-input" id="bCategory" type="text"
            placeholder="Dev, QA, Tutorial…" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Tags</label>
          <input class="cms-input" id="bTags" type="text"
            placeholder="tag1, tag2, tag3" />
        </div>
      </div>

      <div class="cms-field">
        <label class="cms-label">Excerpt *</label>
        <textarea class="cms-input cms-textarea-sm" id="bExcerpt"
          placeholder="One sentence description for SEO and card preview…"
          rows="2"></textarea>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Image URL</label>
          <input class="cms-input" id="bImageUrl" type="url"
            placeholder="https://drive.google.com/…" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Image Alt</label>
          <input class="cms-input" id="bImageAlt" type="text"
            placeholder="Descriptive alt text" />
        </div>
      </div>

      <div class="cms-field">
        <label class="cms-label">
          Content
          <span class="cms-label-hint">
            Markdown: ## Heading, **bold**, *italic*, \`code\`,
            - list, [link](url), \`\`\` code block
          </span>
        </label>
        <div class="cms-editor-wrap">
          <div class="cms-editor-pane">
            <div class="cms-editor-label">Write</div>
            <textarea class="cms-input cms-editor" id="bContent"
              placeholder="Write your blog post in markdown…"
              rows="20" spellcheck="true"></textarea>
          </div>
          <div class="cms-preview-pane">
            <div class="cms-editor-label">Preview</div>
            <div class="cms-preview article-body" id="bPreview"></div>
          </div>
        </div>
      </div>

      <div class="cms-actions">
        <button class="cms-btn cms-btn-primary" id="bPublish">
          Publish to Sheet →
        </button>
        <span class="cms-status" id="bStatus"></span>
      </div>
    </div>`;

  // Auto-generate slug from title
  const titleEl = document.getElementById('bTitle');
  const slugEl  = document.getElementById('bSlug');
  titleEl.addEventListener('input', () => {
    if (!slugEl._manuallyEdited) {
      slugEl.value = makeSlug(titleEl.value);
    }
  });
  slugEl.addEventListener('input', () => { slugEl._manuallyEdited = true; });

  // Live markdown preview
  const contentEl = document.getElementById('bContent');
  const previewEl = document.getElementById('bPreview');
  let previewTimer;
  contentEl.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewEl.innerHTML = md(contentEl.value);
    }, 300);
  });

  // Publish
  document.getElementById('bPublish').addEventListener('click', async () => {
    await publishBlogPost();
  });
}

async function publishBlogPost() {
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

  if (!title) { showToast('Title is required', 'error'); return; }
  if (!excerpt) { showToast('Excerpt is required', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Publishing…';
  statusEl.textContent = '';

  const row = {
    Title:     title,
    Slug:      slug,
    Date:      date,
    Category:  category,
    Excerpt:   excerpt,
    Tags:      tags,
    Image_URL: imageUrl,
    Image_Alt: imageAlt,
    Content:   content,
  };

  try {
    const result = await apiWrite('blog', row);
    if (result.ok) {
      showToast('Blog post published to sheet!');
      statusEl.textContent = `✓ Published: ${slug}`;
      statusEl.style.color = 'var(--accent)';
      // Clear form
      ['bTitle','bSlug','bCategory','bTags','bExcerpt',
       'bImageUrl','bImageAlt','bContent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('bPreview').innerHTML = '';
      document.getElementById('bDate').value = today();
    } else {
      showToast(result.error || 'Publish failed', 'error');
      statusEl.textContent = '✗ ' + (result.error || 'Error');
      statusEl.style.color = '#991b1b';
    }
  } catch (e) {
    showToast('Network error', 'error');
    statusEl.textContent = '✗ Network error';
    statusEl.style.color = '#991b1b';
  }

  btn.disabled = false;
  btn.textContent = 'Publish to Sheet →';
}

// ── CHORDS FORM ───────────────────────────────────────────────────────────

function renderChordsForm(container) {
  const keys = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B',
                 'Cm','Dm','Em','Am','Fm','Gm'];
  const keyOptions = keys.map(k =>
    `<option value="${esc(k)}">${esc(k)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="cms-form-wrap">
      <h3 class="cms-form-title">New Chord Sheet</h3>

      <div class="cms-row">
        <div class="cms-field cms-field-wide">
          <label class="cms-label">Song Title *</label>
          <input class="cms-input" id="cTitle" type="text"
            placeholder="Timi Bina Life Zero" required />
        </div>
        <div class="cms-field">
          <label class="cms-label">Slug</label>
          <input class="cms-input" id="cSlug" type="text"
            placeholder="auto-generated" />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Artist *</label>
          <input class="cms-input" id="cArtist" type="text"
            placeholder="The Axe Band" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Album</label>
          <input class="cms-input" id="cAlbum" type="text" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Year</label>
          <input class="cms-input" id="cYear" type="number"
            placeholder="2024" min="1900" max="2099" />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Key</label>
          <select class="cms-input cms-select" id="cKey">
            <option value="">-- select --</option>
            ${keyOptions}
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Capo</label>
          <input class="cms-input" id="cCapo" type="number"
            min="0" max="12" value="0" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Difficulty</label>
          <select class="cms-input cms-select" id="cDifficulty">
            <option value="beginner">Beginner</option>
            <option value="intermediate" selected>Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Category</label>
          <select class="cms-input cms-select" id="cCategory">
            <option value="nepali">Nepali</option>
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="devotional">Devotional</option>
            <option value="folk">Folk</option>
            <option value="pop">Pop</option>
            <option value="rock">Rock</option>
            <option value="classical">Classical</option>
          </select>
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Chords Used</label>
          <input class="cms-input" id="cChordsUsed" type="text"
            placeholder="G, Em7, Cadd9, D" />
        </div>
        <div class="cms-field">
          <label class="cms-label">BPM</label>
          <input class="cms-input" id="cBPM" type="number" placeholder="72" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Time Signature</label>
          <input class="cms-input" id="cTimeSig" type="text" placeholder="4/4" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Tuning</label>
          <input class="cms-input" id="cTuning" type="text"
            value="Standard" placeholder="Standard" />
        </div>
      </div>

      <div class="cms-row">
        <div class="cms-field">
          <label class="cms-label">Date Added</label>
          <input class="cms-input" id="cDate" type="date" value="${today()}" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Featured</label>
          <select class="cms-input cms-select" id="cFeatured">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        <div class="cms-field">
          <label class="cms-label">Image URL</label>
          <input class="cms-input" id="cImageUrl" type="url" />
        </div>
        <div class="cms-field">
          <label class="cms-label">Image Alt</label>
          <input class="cms-input" id="cImageAlt" type="text" />
        </div>
      </div>

      <div class="cms-field">
        <label class="cms-label">Excerpt</label>
        <textarea class="cms-input cms-textarea-sm" id="cExcerpt"
          rows="2"
          placeholder="Learn to play this song with G Em7 Cadd9 chords…"></textarea>
      </div>

      <div class="cms-field">
        <label class="cms-label">
          Tab Content
          <span class="cms-label-hint">
            Use [G] [Em7] before words for chords.
            Use | for line breaks. Use || for empty lines between sections.
            Start section labels on their own line: [Verse 1]| [Chorus]|
          </span>
        </label>
        <div class="cms-editor-wrap">
          <div class="cms-editor-pane">
            <div class="cms-editor-label">Write</div>
            <textarea class="cms-input cms-editor cms-editor-mono"
              id="cTabContent"
              placeholder="[Verse 1]|[G]Timro ohth lai [Em7]choyera niskida|[Cadd9]Harek jhuto rangeen sacho [D]bho||[Chorus]|..."
              rows="20" spellcheck="false"></textarea>
          </div>
          <div class="cms-preview-pane">
            <div class="cms-editor-label">Preview</div>
            <div class="cms-preview cms-tab-preview" id="cTabPreview"></div>
          </div>
        </div>
      </div>

      <div class="cms-actions">
        <button class="cms-btn cms-btn-primary" id="cPublish">
          Publish to Sheet →
        </button>
        <span class="cms-status" id="cStatus"></span>
      </div>
    </div>`;

  // Auto-generate slug from title
  const titleEl = document.getElementById('cTitle');
  const slugEl  = document.getElementById('cSlug');
  titleEl.addEventListener('input', () => {
    if (!slugEl._manuallyEdited) {
      slugEl.value = makeSlug(titleEl.value);
    }
  });
  slugEl.addEventListener('input', () => { slugEl._manuallyEdited = true; });

  // Live tab preview
  const tabEl      = document.getElementById('cTabContent');
  const previewEl  = document.getElementById('cTabPreview');
  let   previewTimer;
  tabEl.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewEl.innerHTML = renderTabPreview(tabEl.value);
    }, 300);
  });

  // Publish
  document.getElementById('cPublish').addEventListener('click', async () => {
    await publishChordSheet();
  });
}

// Simple tab preview for the CMS editor
function renderTabPreview(raw) {
  if (!raw) return '<span style="color:var(--muted-light)">Preview will appear here…</span>';
  const CHORD_RE = /^[A-G][#b]?(maj7|m7|7|sus2|sus4|add9|m|5)?$/;
  const lines = raw.split('|');
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<div style="height:.6rem"></div>';
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && !CHORD_RE.test(sectionMatch[1])) {
      return `<div style="font-family:var(--serif);font-weight:500;color:var(--accent2);margin:.8rem 0 .2rem">${esc(sectionMatch[1])}</div>`;
    }
    const parts = line.split(/(\[[^\]]+\])/);
    const spans = parts.map(part => {
      const m = part.match(/^\[([^\]]+)\]$/);
      if (m && CHORD_RE.test(m[1])) {
        return `<span style="color:var(--accent);font-weight:500">${esc(m[1])}</span>`;
      }
      return esc(part);
    });
    return `<div style="font-family:var(--mono);font-size:.82rem;line-height:2">${spans.join('')}</div>`;
  }).join('');
}

async function publishChordSheet() {
  const title      = document.getElementById('cTitle').value.trim();
  const slug       = document.getElementById('cSlug').value.trim() || makeSlug(title);
  const artist     = document.getElementById('cArtist').value.trim();
  const album      = document.getElementById('cAlbum').value.trim();
  const year       = document.getElementById('cYear').value.trim();
  const key        = document.getElementById('cKey').value;
  const capo       = document.getElementById('cCapo').value;
  const difficulty = document.getElementById('cDifficulty').value;
  const category   = document.getElementById('cCategory').value;
  const chordsUsed = document.getElementById('cChordsUsed').value.trim();
  const bpm        = document.getElementById('cBPM').value.trim();
  const timeSig    = document.getElementById('cTimeSig').value.trim();
  const tuning     = document.getElementById('cTuning').value.trim();
  const date       = document.getElementById('cDate').value || today();
  const featured   = document.getElementById('cFeatured').value;
  const imageUrl   = document.getElementById('cImageUrl').value.trim();
  const imageAlt   = document.getElementById('cImageAlt').value.trim();
  const excerpt    = document.getElementById('cExcerpt').value.trim();
  const tabContent = document.getElementById('cTabContent').value;
  const statusEl   = document.getElementById('cStatus');
  const btn        = document.getElementById('cPublish');

  if (!title)  { showToast('Title is required', 'error'); return; }
  if (!artist) { showToast('Artist is required', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Publishing…';
  statusEl.textContent = '';

  const row = {
    Slug:           slug,
    Title:          title,
    Artist:         artist,
    Album:          album,
    Year:           year,
    Key:            key,
    Capo:           capo,
    Difficulty:     difficulty,
    Category:       category,
    Chords_Used:    chordsUsed,
    Tab_Content:    tabContent,
    BPM:            bpm,
    Time_Signature: timeSig,
    Tuning:         tuning,
    Date_Added:     date,
    Featured:       featured,
    Image_URL:      imageUrl,
    Image_Alt:      imageAlt,
    Excerpt:        excerpt,
  };

  try {
    const result = await apiWrite('chords', row);
    if (result.ok) {
      showToast('Chord sheet published to sheet!');
      statusEl.textContent = `✓ Published: ${slug}`;
      statusEl.style.color = 'var(--accent)';
    } else {
      showToast(result.error || 'Publish failed', 'error');
      statusEl.textContent = '✗ ' + (result.error || 'Error');
      statusEl.style.color = '#991b1b';
    }
  } catch (e) {
    showToast('Network error', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Publish to Sheet →';
}