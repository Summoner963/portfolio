// worker/cms-proxy.js
// ═══════════════════════════════════════════════════════════════════════════
//  CMS API → Google Apps Script. Called only after Cloudflare Access
//  verification + same-origin check in worker/index.js.
//
//  Nothing from the client is trusted:
//   - sheet names, actions and slug columns are fixed server-side
//   - rows are rebuilt from an allow-list of fields with type/length rules
//   - text that a spreadsheet would treat as a formula is neutralised
//   - errors returned to the browser are generic (details only in logs)
//
//  Secrets (Cloudflare Pages secrets, never in code or the browser):
//   CMS_APPS_SCRIPT_URL, CMS_APPS_SCRIPT_SECRET
// ═══════════════════════════════════════════════════════════════════════════

import { SLUG_RE } from '../public/js/shared/render.js';

const isDate  = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime());
const isHttp  = v => v === '' || (/^https:\/\/[^\s"<>]+$/i.test(v) && v.length <= 1000);
const isSlug  = v => SLUG_RE.test(v) && v.length <= 100;
const isInt   = (min, max) => v => /^\d+$/.test(v) && +v >= min && +v <= max;
const maxLen  = n => v => v.length <= n;
const oneOf   = (...vals) => v => v === '' || vals.includes(v.toLowerCase());

// Logical sheet → field rules. `key` is the column used to find rows to update/delete.
const SHEETS = {
  blog: {
    key: 'Slug',
    fields: {
      ID: maxLen(20), Title: v => v.length > 0 && v.length <= 200, Slug: isSlug,
      Category: maxLen(60), Excerpt: maxLen(400), Content: maxLen(100_000),
      Date: v => v === '' || isDate(v), Last_Modified: v => v === '' || isDate(v),
      Tags: maxLen(300), Image_URL: isHttp, Image_Alt: maxLen(200),
      Status: oneOf('published', 'draft', 'unpublished', 'hidden', 'private'),
    },
    required: ['Title', 'Slug'],
  },
  blogimage: {
    key: 'Blog_Slug',
    fields: { Blog_Slug: isSlug, Img_Number: isInt(1, 50), Img_URL: isHttp, Img_Alt: maxLen(200) },
    required: ['Blog_Slug', 'Img_Number', 'Img_URL'],
  },
  faq: {
    key: 'Blog_Slug',
    fields: { Blog_Slug: isSlug, FAQ_Number: isInt(1, 100), FAQ_Question: maxLen(300), FAQ_Answer: maxLen(2000) },
    required: ['Blog_Slug', 'FAQ_Number', 'FAQ_Question', 'FAQ_Answer'],
  },
};
// Public sheet behind each logical CMS sheet (for cache invalidation)
export const PUBLIC_SHEET = { blog: 'blog', blogimage: 'images', faq: 'faq' };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json' },
});
const fail = (error, status = 400) => json({ ok: false, error }, status);

/** Normalise text; neutralise spreadsheet formulas (leading = + - @). */
export function cleanCell(v) {
  let s = String(v ?? '').normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // control chars (keeps \t \n)
    .trim();
  // A leading apostrophe makes Sheets store the cell as plain text.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return s;
}

/** Rebuild a row from the allow-list. Returns { row } or { error }. */
export function validateRow(sheet, input, { partial = false } = {}) {
  const spec = SHEETS[sheet];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid row' };
  const row = {};
  for (const [field, check] of Object.entries(spec.fields)) {
    if (!(field in input)) continue;
    const raw = String(input[field] ?? '').trim();
    if (!check(raw)) return { error: `Invalid value for ${field}` };
    row[field] = cleanCell(raw);
  }
  if (!partial) for (const f of spec.required) if (!row[f]) return { error: `${f} is required` };
  return { row };
}

async function callScript(payload, env) {
  const url = env.CMS_APPS_SCRIPT_URL || '';
  if (!/^https:\/\/script\.google\.com\//.test(url)) {
    console.warn('[cms] CMS_APPS_SCRIPT_URL missing or not an Apps Script URL');
    return fail('CMS is not configured', 503);
  }
  try {
    const resp = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret: env.CMS_APPS_SCRIPT_SECRET || '' }),
    });
    const result = await resp.json().catch(() => null);
    if (!resp.ok || !result || result.ok !== true) {
      console.warn('[cms] Apps Script rejected', payload.action, payload.sheet, resp.status);
      return fail('Save failed — please try again', 502);
    }
    // Only pass back what the UI needs
    return json(payload.action === 'read' ? { ok: true, rows: Array.isArray(result.rows) ? result.rows : [] } : { ok: true });
  } catch (e) {
    console.warn('[cms] Apps Script unreachable:', e.name);
    return fail('Content service unavailable', 502);
  }
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 300_000) return null; // ~3× max post size
  try { return JSON.parse(text); } catch { return null; }
}

/** POST /api/cms/read  { sheet } */
export async function handleCMSRead(request, env) {
  const body = await readBody(request);
  const sheet = String(body?.sheet || '').toLowerCase();
  if (!SHEETS[sheet]) return fail('Unknown sheet');
  return callScript({ action: 'read', sheet }, env);
}

/**
 * POST /api/cms/write
 *   { action: 'append', sheet, row } | { action: 'update', sheet, slug, row } | { action: 'delete', sheet, slug }
 * @returns {Promise<{ res: Response, sheet?: string }>} sheet set when data changed
 */
export async function handleCMSWrite(request, env) {
  const body = await readBody(request);
  if (!body) return { res: fail('Invalid request') };
  const action = String(body.action || '');
  const sheet = String(body.sheet || '').toLowerCase();
  const spec = SHEETS[sheet];
  if (!spec) return { res: fail('Unknown sheet') };
  if (!['append', 'update', 'delete'].includes(action)) return { res: fail('Unknown action') };

  const payload = { action, sheet };
  if (action !== 'append') {
    const slug = String(body.slug || '').trim();
    if (!isSlug(slug)) return { res: fail('Invalid slug') };
    Object.assign(payload, { slug, slugField: spec.key }); // key column fixed server-side
  }
  if (action !== 'delete') {
    const { row, error } = validateRow(sheet, body.row);
    if (error) return { res: fail(error) };
    if (sheet === 'blog' && action === 'update') row.Last_Modified = new Date().toISOString().slice(0, 10);
    payload.row = row;
  }
  const res = await callScript(payload, env);
  return { res, sheet: res.ok ? PUBLIC_SHEET[sheet] : undefined };
}
