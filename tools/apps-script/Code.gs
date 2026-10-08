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
  row = assignId(tab, headers, row);
  tab.appendRow(headers.map(function (h) { return h in row ? cell(row[h], h) : ''; }));
  formatDates(tab, tab.getLastRow(), headers);
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
      var values = headers.map(function (h, idx) { return h in row ? cell(row[h], h) : data[i][idx]; });
      tab.getRange(i + 1, 1, 1, headers.length).setValues([values]);
      formatDates(tab, i + 1, headers);
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

// New rows in a tab with an "ID" column get the next number (highest + 1).
// Runs inside the script lock, so two saves can never get the same ID.
function assignId(tab, headers, row) {
  var col = headers.indexOf('ID');
  if (col === -1 || String(row.ID || '').trim()) return row;
  var max = 0;
  if (tab.getLastRow() > 1) {
    tab.getRange(2, col + 1, tab.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var n = parseInt(r[0], 10);
      if (!isNaN(n) && n > max) max = n;
    });
  }
  var copy = {};
  for (var k in row) copy[k] = row[k];
  copy.ID = String(max + 1);
  return copy;
}
function headerRow(tab) {
  return tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

// Date columns: the CMS sends 2026-10-08; store a real date so the Sheet
// shows it like the rest ("October 8, 2026" — see formatDates).
var DATE_COLUMNS = ['Date', 'Last_Modified'];
var DATE_FORMAT  = 'mmmm d, yyyy';

// Plain text only: a leading = + - @ would make Sheets evaluate a formula.
// The worker already adds the apostrophe; this is a second layer.
function cell(v, header) {
  var s = String(v == null ? '' : v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && DATE_COLUMNS.indexOf(header) !== -1) return new Date(+m[1], +m[2] - 1, +m[3]);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function formatDates(tab, rowIndex, headers) {
  DATE_COLUMNS.forEach(function (h) {
    var col = headers.indexOf(h);
    if (col !== -1) tab.getRange(rowIndex, col + 1).setNumberFormat(DATE_FORMAT);
  });
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
