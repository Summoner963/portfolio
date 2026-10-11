// js/views/cms-content.js
// ═══════════════════════════════════════════════════════════════════════════
//  CMS screens for everything except blog posts:
//    Site text (Site tab: Key | Value), Projects, Skills, Experience (list
//    tabs, rows found by ID), About (single row), Featured posts, Contact FAQ.
//  `api` = { read(sheet), append(sheet,row), update(sheet,key,row), del(sheet,key) }
//  from cms.js (session + CSRF handled there). The worker validates every
//  field again (worker/cms-proxy.js) — the checks here are for friendly errors.
// ═══════════════════════════════════════════════════════════════════════════

import { esc, showToast } from '../utils.js';
import { SITE_FIELDS, siteMap } from '../shared/render.js';

const isHttps = v => /^https?:\/\/[^\s"<>]+$/i.test(v);
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };
const header = (title, extra = '') =>
  `<div class="cms-list-header"><h3 class="cms-form-title">${esc(title)}</h3>${extra}</div>`;

async function readRows(api, sheet) {
  const res = await api.read(sheet);
  if (!res.ok) throw new Error(res.error || 'Could not load');
  return res.rows || [];
}

/**
 * Live "n / max" under a field; amber past max. Google shows about 60
 * characters of a title and about 155 of a description.
 */
export function charCounter(input, max) {
  if (!input) return;
  const out = document.createElement('span');
  out.className = 'cms-count';
  const update = () => {
    const n = [...input.value.trim()].length;
    out.textContent = `${n} / ${max}` + (n > max ? ' — Google may cut this off' : '');
    out.classList.toggle('over', n > max);
  };
  input.addEventListener('input', update);
  input.after(out);
  update();
}

function failBox(panel, title, err, retry) {
  panel.innerHTML = header(title) +
    `<div class="cms-list-empty">Could not load: ${esc(err.message || err)} ` +
    `<button class="cms-btn cms-btn-ghost cms-btn-sm" data-retry>Try again</button></div>`;
  panel.querySelector('[data-retry]').addEventListener('click', retry);
}

// ─────────────────────────────────────────────────────────────────────────
//  Site text
// ─────────────────────────────────────────────────────────────────────────

export async function renderSiteSettings(panel, api) {
  panel.innerHTML = header('Site text') + '<div class="cms-list-loading">Loading…</div>';
  let rows;
  try { rows = await readRows(api, 'site'); }
  catch (e) { return failBox(panel, 'Site text', e, () => renderSiteSettings(panel, api)); }

  const saved = siteMap(rows);
  const missing = SITE_FIELDS.filter(f => !(f.key in saved));
  const groups = [...new Set(SITE_FIELDS.map(f => f.group))];
  const input = f => {
    const v = f.key in saved ? saved[f.key] : f.def;
    const id = `site-${f.key}`;
    const attrs = `class="cms-input" id="${id}" data-key="${esc(f.key)}" placeholder="${esc(f.def)}"`;
    const control = f.type === 'textarea'
      ? `<textarea ${attrs} rows="${f.key === 'hero_title' ? 2 : 3}">${esc(v)}</textarea>`
      : `<input ${attrs} type="text" value="${esc(v)}" />`;
    return `<div class="cms-field"><label class="cms-label" for="${id}">${esc(f.label)}` +
      (f.key in saved ? '' : ' <span class="cms-label-hint">(not in Sheet yet — showing the current text)</span>') +
      `</label>${control}</div>`;
  };

  panel.innerHTML = header('Site text',
      '<button class="cms-btn cms-btn-primary" id="siteSave">Save changes</button>') +
    `<p class="cms-label-hint" style="margin:0 0 1rem">Every text on the website that isn't a blog post, project, skill or
      experience entry. Empty a field to hide it where marked. Formatting: a new line = line break,
      <code>*word*</code> = accent/italic, <code>**word**</code> = bold.</p>` +
    (missing.length ? `<div class="cms-inline-row" style="margin-bottom:1rem">
      <span>${missing.length} setting(s) are not in your Site tab yet.</span>
      <button class="cms-btn cms-btn-ghost cms-btn-sm" id="siteCopyRows" type="button">Copy them (paste into the Site tab, cell A${rows.length + 2})</button>
    </div>` : '') +
    groups.map(g => `<fieldset class="cms-site-group"><legend class="cms-form-title">${esc(g)}</legend>` +
      SITE_FIELDS.filter(f => f.group === g).map(input).join('') + `</fieldset>`).join('') +
    `<div class="cms-actions"><button class="cms-btn cms-btn-primary" id="siteSave2">Save changes</button>
      <span class="cms-status" id="siteStatus"></span></div>`;

  panel.querySelector('#siteCopyRows')?.addEventListener('click', async () => {
    // Tab-separated rows paste straight into two Sheet columns
    const tsv = missing.map(f => `${f.key}\t${f.def.includes('\n') || f.def.includes('"')
      ? `"${f.def.replace(/"/g, '""')}"` : f.def}`).join('\n');
    try { await navigator.clipboard.writeText(tsv); showToast(`${missing.length} rows copied — paste into the Site tab`); }
    catch { prompt('Copy these rows (Ctrl+C), then paste into the Site tab:', tsv); }
  });

  const save = async () => {
    const status = panel.querySelector('#siteStatus');
    const btns = [panel.querySelector('#siteSave'), panel.querySelector('#siteSave2')];
    const changed = [...panel.querySelectorAll('[data-key]')].filter(el => {
      const f = SITE_FIELDS.find(x => x.key === el.dataset.key);
      const before = f.key in saved ? saved[f.key] : f.def;
      return el.value.replace(/\r\n?/g, '\n').trim() !== before;
    });
    if (!changed.length) { showToast('Nothing changed'); return; }
    btns.forEach(b => busy(b, true, 'Saving…'));
    const failed = [];
    for (const el of changed) {
      const value = el.value.replace(/\r\n?/g, '\n').trim();
      // update finds the row by Key and appends it if missing
      const res = await api.update('site', el.dataset.key, { Key: el.dataset.key, Value: value });
      if (res.ok) saved[el.dataset.key] = value; else failed.push(`${el.dataset.key} (${res.error || 'error'})`);
    }
    btns.forEach(b => busy(b, false, 'Save changes'));
    if (failed.length) { status.textContent = '✗ Not saved: ' + failed.join(', '); status.style.color = '#991b1b'; }
    else { status.textContent = `✓ Saved ${changed.length} change(s) — live within a few minutes`; status.style.color = ''; showToast('Site text saved'); }
  };
  panel.querySelector('#siteSave').addEventListener('click', save);
  panel.querySelector('#siteSave2').addEventListener('click', save);
  panel.querySelectorAll('[data-key^="meta_title_"]').forEach(el => charCounter(el, 60));
  panel.querySelectorAll('[data-key^="meta_desc_"]').forEach(el => charCounter(el, 155));
}

// ─────────────────────────────────────────────────────────────────────────
//  List tabs: Projects, Skills, Experience
// ─────────────────────────────────────────────────────────────────────────

// [column, label, type, options]  — column names match your Sheet headers
export const LISTS = {
  projects: {
    title: 'Projects', item: 'project', main: 'title', sub: 'stack',
    fields: [
      ['title', 'Title', 'text', { required: true }],
      ['desc', 'Description', 'textarea'],
      ['highlights', 'Highlights — one per line', 'lines'],
      ['stack', 'Tech stack — comma-separated', 'text'],
      ['link', 'Project link (https://…) — optional', 'url'],
      ['num', 'Number shown (optional, e.g. 01)', 'text'],
      ['featured', 'Featured (big card with icon)', 'bool'],
      ['span2', 'Wide card', 'bool'],
    ],
  },
  skills: {
    title: 'Skills', item: 'skill group', main: 'title', sub: 'tags',
    fields: [
      ['icon', 'Icon (an emoji)', 'text'],
      ['title', 'Group name', 'text', { required: true }],
      ['color', 'Colour', 'select', { options: [['green', 'Green'], ['blue', 'Blue'], ['amber', 'Amber']] }],
      ['tags', 'Skills — comma-separated', 'text'],
    ],
  },
  exp: {
    title: 'Experience', item: 'entry', main: 'role', sub: 'org',
    fields: [
      ['date', 'Date (e.g. Sep – Dec 2025)', 'text'],
      ['role', 'Role / title', 'text', { required: true }],
      ['org', 'Organisation', 'text'],
      ['bullets', 'Points — one per line', 'lines'],
    ],
  },
};
const OPTIONAL = [ // shown only if your tab has these columns
  ['Order', 'Order (lower number = shown first; empty = Sheet order)', 'number'],
  ['Status', 'Visibility', 'select', { options: [['', 'Published'], ['draft', 'Draft (hidden)']] }],
];
const toLines = v => String(v || '').split(/\s*\|\s*/).filter(Boolean).join('\n');
const fromLines = v => v.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(' | ');
const truthy = v => /^(true|yes|1|✓|x)$/i.test(String(v || '').trim());

export async function renderList(panel, api, sheet) {
  const cfg = LISTS[sheet];
  panel.innerHTML = header(cfg.title) + '<div class="cms-list-loading">Loading…</div>';
  let rows;
  try { rows = await readRows(api, sheet); }
  catch (e) { return failBox(panel, cfg.title, e, () => renderList(panel, api, sheet)); }

  const columns = rows.length ? Object.keys(rows[0]) : [];
  const fields = [...cfg.fields, ...OPTIONAL.filter(([c]) => columns.includes(c))];
  const list = rows.filter(r => String(r[cfg.main] || '').trim());

  panel.innerHTML = header(cfg.title, `<button class="cms-btn cms-btn-primary" data-add>+ Add ${esc(cfg.item)}</button>`) +
    `<p class="cms-label-hint" style="margin:0 0 1rem">Shown on the website in this order${columns.includes('Order') ? ' (or by the Order field)' : ''}.
      To reorder, ${columns.includes('Order') ? 'set Order numbers, or ' : ''}move rows in the Sheet.</p>` +
    `<div class="cms-list-body">${list.length ? '' : '<div class="cms-list-empty">Nothing here yet.</div>'}</div>`;
  const body = panel.querySelector('.cms-list-body');
  for (const row of list) {
    const item = document.createElement('div');
    item.className = 'cms-list-item';
    item.innerHTML = `<div class="cms-list-item-main"><span class="cms-list-item-title">${esc(row[cfg.main])}</span>` +
      `<span class="cms-list-item-meta">${/^draft$/i.test(row.Status || '') ? '<span class="cms-list-badge">Draft</span>' : ''}` +
      `<span class="cms-list-date">${esc(String(row[cfg.sub] || '').slice(0, 80))}</span></span></div>` +
      `<div class="cms-list-item-actions"><button class="cms-btn cms-btn-ghost cms-btn-sm" data-edit>Edit</button>` +
      `<button class="cms-btn cms-btn-danger cms-btn-sm" data-del>Delete</button></div>`;
    item.querySelector('[data-edit]').addEventListener('click', () => listForm(panel, api, sheet, fields, row));
    item.querySelector('[data-del]').addEventListener('click', async () => {
      if (!String(row.ID || '').trim()) { showToast('This row has no ID yet — reload and try again', 'error'); return; }
      if (!confirm(`Delete "${row[cfg.main]}"?`)) return;
      const res = await api.del(sheet, String(row.ID));
      if (res.ok) { showToast('Deleted'); renderList(panel, api, sheet); }
      else showToast(res.error || 'Delete failed', 'error');
    });
    body.appendChild(item);
  }
  panel.querySelector('[data-add]').addEventListener('click', () => listForm(panel, api, sheet, fields, null));
}

function listForm(panel, api, sheet, fields, row) {
  const cfg = LISTS[sheet];
  const isEdit = !!row;
  const r = row || {};
  const control = ([col, label, type, opt = {}]) => {
    const id = `lf-${col}`;
    const v = r[col] ?? '';
    let html;
    if (type === 'textarea' || type === 'lines') html = `<textarea class="cms-input" id="${id}" rows="${type === 'lines' ? 4 : 3}">${esc(type === 'lines' ? toLines(v) : v)}</textarea>`;
    else if (type === 'bool') html = `<label class="cms-check"><input type="checkbox" id="${id}"${truthy(v) ? ' checked' : ''}/> Yes</label>`;
    else if (type === 'select') {
      const cur = String(v).toLowerCase().replace(/^c-/, '');
      html = `<select class="cms-input cms-select" id="${id}">` + opt.options.map(([val, text]) =>
        `<option value="${esc(val)}"${cur === val ? ' selected' : ''}>${esc(text)}</option>`).join('') + `</select>`;
    }
    else html = `<input class="cms-input" id="${id}" type="${type === 'number' ? 'number' : 'text'}" value="${esc(v)}" />`;
    return `<div class="cms-field"><label class="cms-label" for="${id}">${esc(label)}${opt.required ? ' *' : ''}</label>${html}</div>`;
  };
  panel.innerHTML = `<div class="cms-form-wrap"><div class="cms-form-topbar">
      <button class="cms-btn cms-btn-ghost cms-btn-sm" data-back>← All ${esc(cfg.title)}</button>
      <h3 class="cms-form-title">${isEdit ? 'Edit' : 'New'} ${esc(cfg.item)}</h3></div>` +
    fields.map(control).join('') +
    `<div class="cms-actions"><button class="cms-btn cms-btn-primary" data-save>${isEdit ? 'Save changes' : 'Add'}</button>
      <button class="cms-btn cms-btn-ghost" data-back>Cancel</button><span class="cms-status" data-status></span></div></div>`;

  let dirty = false;
  panel.addEventListener('input', () => { dirty = true; }, { once: true });
  panel.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
    if (dirty && !confirm('Leave without saving?')) return;
    renderList(panel, api, sheet);
  }));
  panel.querySelector('[data-save]').addEventListener('click', async e => {
    const btn = e.currentTarget, status = panel.querySelector('[data-status]');
    const out = {};
    for (const [col, , type] of fields) {
      const el = panel.querySelector(`#lf-${col}`);
      out[col] = type === 'bool' ? (el.checked ? 'true' : 'false')
        : type === 'lines' ? fromLines(el.value) : el.value.trim();
    }
    const missing = fields.find(([col, , , opt = {}]) => opt.required && !out[col]);
    if (missing) { status.textContent = `✗ ${missing[1]} is required`; return; }
    if (out.link && !isHttps(out.link)) { status.textContent = '✗ Link must start with https://'; return; }
    busy(btn, true, 'Saving…');
    const res = isEdit && String(r.ID || '').trim()
      ? await api.update(sheet, String(r.ID), { ...out, ID: String(r.ID) })
      : await api.append(sheet, out); // Apps Script assigns the next ID
    busy(btn, false, isEdit ? 'Save changes' : 'Add');
    if (!res.ok) { status.textContent = '✗ ' + (res.error || 'Save failed'); return; }
    showToast(isEdit ? 'Saved — live within a few minutes' : 'Added — live within a few minutes');
    renderList(panel, api, sheet);
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  About (single row: bio1..bio4)
// ─────────────────────────────────────────────────────────────────────────

export async function renderAboutEditor(panel, api) {
  panel.innerHTML = header('About text') + '<div class="cms-list-loading">Loading…</div>';
  let rows;
  try { rows = await readRows(api, 'about'); }
  catch (e) { return failBox(panel, 'About text', e, () => renderAboutEditor(panel, api)); }
  const r = rows[0] || {};
  const keys = ['bio1', 'bio2', 'bio3', 'bio4'];
  panel.innerHTML = header('About text') +
    '<p class="cms-label-hint" style="margin:0 0 1rem">Each box is one paragraph on the About page. Leave a box empty to skip it.</p>' +
    keys.map((k, i) => `<div class="cms-field"><label class="cms-label" for="ab-${k}">Paragraph ${i + 1}</label>` +
      `<textarea class="cms-input" id="ab-${k}" rows="4">${esc(r[k] || '')}</textarea></div>`).join('') +
    '<div class="cms-actions"><button class="cms-btn cms-btn-primary" data-save>Save</button><span class="cms-status" data-status></span></div>';
  panel.querySelector('[data-save]').addEventListener('click', async e => {
    const btn = e.currentTarget, status = panel.querySelector('[data-status]');
    const row = Object.fromEntries(keys.map(k => [k, panel.querySelector(`#ab-${k}`).value.trim()]));
    busy(btn, true, 'Saving…');
    const res = await api.update('about', '2', row);
    busy(btn, false, 'Save');
    status.textContent = res.ok ? '✓ Saved — live within a few minutes' : '✗ ' + (res.error || 'Save failed');
    if (res.ok) showToast('About text saved');
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Featured posts (ordered list of blog slugs)
// ─────────────────────────────────────────────────────────────────────────

export async function renderFeaturedEditor(panel, api) {
  panel.innerHTML = header('Featured posts') + '<div class="cms-list-loading">Loading…</div>';
  let featured, posts;
  try { [featured, posts] = await Promise.all([readRows(api, 'featured'), readRows(api, 'blog')]); }
  catch (e) { return failBox(panel, 'Featured posts', e, () => renderFeaturedEditor(panel, api)); }
  const titles = Object.fromEntries(posts.map(p => [String(p.Slug || '').trim(), p.Title]));
  const original = featured.map(f => String(f.Slug || '').trim()).filter(Boolean);
  let chosen = [...original];

  const draw = () => {
    const options = posts.filter(p => p.Slug && !chosen.includes(p.Slug.trim()))
      .map(p => `<option value="${esc(p.Slug.trim())}">${esc(p.Title || p.Slug)}</option>`).join('');
    panel.innerHTML = header('Featured posts') +
      '<p class="cms-label-hint" style="margin:0 0 1rem">Shown on the home page in this order.</p>' +
      '<div class="cms-list-body">' + (chosen.length ? chosen.map((slug, i) =>
        `<div class="cms-list-item"><div class="cms-list-item-main"><span class="cms-list-item-title">${esc(titles[slug] || slug)}</span>` +
        `<span class="cms-list-item-meta"><span class="cms-list-date">${esc(slug)}${titles[slug] ? '' : ' — no such post'}</span></span></div>` +
        `<div class="cms-list-item-actions"><button class="cms-btn cms-btn-ghost cms-btn-xs" data-up="${i}"${i ? '' : ' disabled'}>↑</button>` +
        `<button class="cms-btn cms-btn-ghost cms-btn-xs" data-down="${i}"${i < chosen.length - 1 ? '' : ' disabled'}>↓</button>` +
        `<button class="cms-btn cms-btn-danger cms-btn-xs" data-rm="${i}">Remove</button></div></div>`).join('')
        : '<div class="cms-list-empty">No featured posts — the section is hidden on the home page.</div>') + '</div>' +
      (options ? `<div class="cms-inline-row" style="margin-top:1rem"><select class="cms-input cms-select" data-pick>${options}</select>` +
        `<button class="cms-btn cms-btn-ghost cms-btn-sm" data-addpick>+ Add</button></div>` : '') +
      '<div class="cms-actions"><button class="cms-btn cms-btn-primary" data-save>Save</button><span class="cms-status" data-status></span></div>';
    panel.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.up; [chosen[i - 1], chosen[i]] = [chosen[i], chosen[i - 1]]; draw(); }));
    panel.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.down; [chosen[i + 1], chosen[i]] = [chosen[i], chosen[i + 1]]; draw(); }));
    panel.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { chosen.splice(+b.dataset.rm, 1); draw(); }));
    panel.querySelector('[data-addpick]')?.addEventListener('click', () => { chosen.push(panel.querySelector('[data-pick]').value); draw(); });
    panel.querySelector('[data-save]').addEventListener('click', save);
  };
  const save = async e => {
    const btn = e.currentTarget, status = panel.querySelector('[data-status]');
    busy(btn, true, 'Saving…');
    // Replace the list: remove old AND chosen slugs (a retry after a partial
    // save must not duplicate), then add in the chosen order
    for (const slug of new Set([...original, ...chosen])) {
      const res = await api.del('featured', slug);
      if (!res.ok) { busy(btn, false, 'Save'); status.textContent = '✗ ' + (res.error || 'Save failed'); return; }
    }
    for (const slug of chosen) {
      const res = await api.append('featured', { Slug: slug });
      if (!res.ok) { busy(btn, false, 'Save'); status.textContent = `✗ Saved up to "${slug}": ${res.error || 'error'} — click Save again`; return; }
    }
    original.splice(0, original.length, ...chosen);
    busy(btn, false, 'Save');
    status.textContent = '✓ Saved — live within a few minutes';
    showToast('Featured posts saved');
  };
  draw();
}

// ─────────────────────────────────────────────────────────────────────────
//  Contact page FAQ (FAQ rows with Blog_Slug = contact)
// ─────────────────────────────────────────────────────────────────────────

export async function renderContactFaq(panel, api) {
  panel.innerHTML = header('Contact page FAQ') + '<div class="cms-list-loading">Loading…</div>';
  let rows;
  try { rows = await readRows(api, 'faq'); }
  catch (e) { return failBox(panel, 'Contact page FAQ', e, () => renderContactFaq(panel, api)); }
  const had = rows.some(r => String(r.Blog_Slug || '').trim() === 'contact');
  let items = rows.filter(r => String(r.Blog_Slug || '').trim() === 'contact')
    .sort((a, b) => Number(a.FAQ_Number || 0) - Number(b.FAQ_Number || 0))
    .map(r => ({ q: r.FAQ_Question || '', a: r.FAQ_Answer || '' }));

  const draw = () => {
    panel.innerHTML = header('Contact page FAQ') +
      '<p class="cms-label-hint" style="margin:0 0 1rem">Questions shown under the contact details (also given to Google as FAQ data).</p>' +
      '<div class="cms-inline-rows">' + items.map((f, i) =>
        `<div class="cms-inline-row cms-faq-row"><div class="cms-faq-fields">` +
        `<input class="cms-input" data-q="${i}" placeholder="Question" value="${esc(f.q)}" />` +
        `<textarea class="cms-input cms-textarea-sm" data-a="${i}" rows="2" placeholder="Answer">${esc(f.a)}</textarea></div>` +
        `<button class="cms-btn cms-btn-danger cms-btn-xs" data-rm="${i}" type="button">✕</button></div>`).join('') + '</div>' +
      '<button class="cms-btn cms-btn-ghost cms-btn-sm" data-add type="button">+ Add question</button>' +
      '<div class="cms-actions"><button class="cms-btn cms-btn-primary" data-save>Save</button><span class="cms-status" data-status></span></div>';
    panel.querySelectorAll('[data-q]').forEach(el => el.addEventListener('input', () => { items[+el.dataset.q].q = el.value; }));
    panel.querySelectorAll('[data-a]').forEach(el => el.addEventListener('input', () => { items[+el.dataset.a].a = el.value; }));
    panel.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { items.splice(+b.dataset.rm, 1); draw(); }));
    panel.querySelector('[data-add]').addEventListener('click', () => { items.push({ q: '', a: '' }); draw(); });
    panel.querySelector('[data-save]').addEventListener('click', save);
  };
  const save = async e => {
    const btn = e.currentTarget, status = panel.querySelector('[data-status]');
    const list = items.map(f => ({ q: f.q.trim(), a: f.a.trim() })).filter(f => f.q);
    if (list.some(f => !f.a)) { status.textContent = '✗ Every question needs an answer'; return; }
    busy(btn, true, 'Saving…');
    if (had) {
      const res = await api.del('faq', 'contact');
      if (!res.ok) { busy(btn, false, 'Save'); status.textContent = '✗ ' + (res.error || 'Save failed'); return; }
    }
    for (let i = 0; i < list.length; i++) {
      const res = await api.append('faq', { Blog_Slug: 'contact', FAQ_Number: String(i + 1), FAQ_Question: list[i].q, FAQ_Answer: list[i].a });
      if (!res.ok) { busy(btn, false, 'Save'); status.textContent = `✗ Question ${i + 1}: ${res.error || 'error'} — click Save again`; return; }
    }
    busy(btn, false, 'Save');
    status.textContent = '✓ Saved — live within a few minutes';
    showToast('Contact FAQ saved');
    renderContactFaq(panel, api);
  };
  draw();
}
