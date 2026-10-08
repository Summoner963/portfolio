// Google Apps Script — Code.gs  (copy of the deployed script; contains NO secrets)
// Called only by the site's worker (worker/cms-proxy.js), never by browsers.
//
// Script Properties (Project Settings → Script Properties):
//   SPREADSHEET_ID  — the Sheet's ID (from its /d/<ID>/edit URL)
//   CMS_SECRET      — long random string; same value as the Cloudflare secret
//                     CMS_APPS_SCRIPT_SECRET
//
// Request body (JSON): { secret, action: read|append|update|delete, sheet, row?, slug? }
// Response (JSON):     { ok: true, rows? } or { ok: false, error }

// CMS sheet name (sent by the worker) → your actual tab name + the column
// used to find rows for update/delete. Edit `tab` if you rename a tab.
var TABS = {
  blog:      { tab: 'Blog',      key: 'Slug' },
  blogimage: { tab: 'BlogImage', key: 'Blog_Slug' },
  faq:       { tab: 'FAQ',       key: 'Blog_Slug' },
};
var ACTIONS = ['read', 'append', 'update', 'delete'];

function doGet() {
  return jsonResponse({ ok: true });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var props  = PropertiesService.getScriptProperties();
    var SECRET = props.getProperty('CMS_SECRET') || '';
    var body   = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Secret only from the JSON body (never the URL), compared in constant time
    if (!SECRET || SECRET.length < 32 || !safeEqual(String(body.secret || ''), SECRET)) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    var action = String(body.action || '');
    var sheet  = String(body.sheet || '').toLowerCase().trim();
    if (ACTIONS.indexOf(action) === -1 || !TABS.hasOwnProperty(sheet)) {
      return jsonResponse({ ok: false, error: 'Bad request' });
    }

    var tab = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName(TABS[sheet].tab);
    if (!tab) return jsonResponse({ ok: false, error: 'Bad request' });

    if (action === 'read') return actionRead(tab);

    lock.waitLock(20000); // one write at a time
    if (action === 'append') return actionAppend(tab, body.row);
    if (action === 'update') return actionUpdate(tab, TABS[sheet].key, body.slug, body.row);
    return actionDelete(tab, TABS[sheet].key, body.slug);

  } catch (err) {
    console.error(err);                     // visible in Apps Script → Executions
    return jsonResponse({ ok: false, error: 'Server error' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

// ── read: every non-empty row as { header: displayed value } ─────────────
function actionRead(tab) {
  var data = tab.getDataRange().getDisplayValues(); // values as shown, e.g. "April 18, 2026"
  if (data.length < 2) return jsonResponse({ ok: true, rows: [] });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i].every(function (c) { return c === ''; })) continue;
    var obj = {};
    headers.forEach(function (h, idx) { if (h) obj[h] = data[i][idx]; });
    rows.push(obj);
  }
  return jsonResponse({ ok: true, rows: rows });
}

// ── append: values placed by header name; unknown keys ignored ───────────
function actionAppend(tab, row) {
  if (!row || typeof row !== 'object') return jsonResponse({ ok: false, error: 'Bad request' });
  var headers = headerRow(tab);
  tab.appendRow(headers.map(function (h) { return h in row ? cell(row[h]) : ''; }));
  return jsonResponse({ ok: true });
}

// ── update: first row whose key column equals slug; appends if missing ───
function actionUpdate(tab, keyField, slug, row) {
  if (!slug || !row || typeof row !== 'object') return jsonResponse({ ok: false, error: 'Bad request' });
  var headers = headerRow(tab);
  var keyCol = headers.indexOf(keyField);
  if (keyCol === -1) return jsonResponse({ ok: false, error: 'Bad request' });

  var data = tab.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyCol]).trim() === String(slug).trim()) {
      var values = headers.map(function (h, idx) { return h in row ? cell(row[h]) : data[i][idx]; });
      tab.getRange(i + 1, 1, 1, headers.length).setValues([values]);
      return jsonResponse({ ok: true });
    }
  }
  return actionAppend(tab, row);
}

// ── delete: every row whose key column equals slug (FAQ/images share a slug)
function actionDelete(tab, keyField, slug) {
  if (!slug) return jsonResponse({ ok: false, error: 'Bad request' });
  var keyCol = headerRow(tab).indexOf(keyField);
  if (keyCol === -1) return jsonResponse({ ok: false, error: 'Bad request' });
  var data = tab.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {   // bottom-up so indices don't shift
    if (String(data[i][keyCol]).trim() === String(slug).trim()) tab.deleteRow(i + 1);
  }
  return jsonResponse({ ok: true });
}

// ── helpers ───────────────────────────────────────────────────────────────
function headerRow(tab) {
  return tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

// Plain text only: a leading = + - @ would make Sheets evaluate a formula.
// The worker already adds the apostrophe; this is a second layer.
function cell(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
