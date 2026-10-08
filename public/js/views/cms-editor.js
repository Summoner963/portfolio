// js/views/cms-editor.js
// ═══════════════════════════════════════════════════════════════════════════
//  Two-pane post editor: VISUAL (contenteditable) ⇄ SHEET FORMAT (textarea).
//
//  The Sheet stores markdown, one line per row of text, each line after the
//  first starting with "|":   "## Title\n|Paragraph\n|- item\n|> [!NOTE] Hi"
//
//  Every markdown line maps to exactly one visual block and back:
//    ## x → <h2>            ### x → <h3>           x → <p>
//    - x  → <ul><li>        1. x → <ol><li>        > x → <blockquote>
//    > [!NOTE] x → <div class="cms-callout" data-callout="NOTE">
//    [img3] → image chip    ``` … ``` → <pre>       (empty) → empty <p>
//  Inline: **bold** *italic* ~~strike~~ `code` [text](https://…)
//  Rendering uses inlineMd() from js/shared/render.js — the same function the
//  public site uses — so the visual pane shows what visitors will see.
//
//  Guarantees (tested in tests/editor.test.html):
//   - lines → visual → lines is lossless for content the site can render
//   - opening a post and saving without edits stores the identical text
//     (saving uses the Sheet-format pane, which is loaded verbatim)
// ═══════════════════════════════════════════════════════════════════════════

import { inlineMd, sheetToLines, linesToSheet, esc } from '../shared/render.js';

export const CALLOUTS = {
  NOTE: 'Note', TIP: 'Tip', WARNING: 'Warning', IMPORTANT: 'Important', INFO: 'Info',
};
const CALLOUT_RE = /^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|INFO)\]\s?(.*)$/i;

// ─────────────────────────────────────────────────────────────────────────
//  Markdown lines → editor HTML
// ─────────────────────────────────────────────────────────────────────────

const inl = s => inlineMd(s) || '<br>';
const imgChip = n => `<div class="cms-img" contenteditable="false" data-img="${esc(n)}">🖼️ Image ${esc(n)}  <span>[img${esc(n)}]</span></div>`;

export function linesToEditorHTML(lines) {
  let out = '', list = null, pre = null;
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of lines) {
    if (line.trim() === '```') {
      if (pre) { out += `<pre>${esc(pre.join('\n'))}</pre>`; pre = null; }
      else { closeList(); pre = []; }
      continue;
    }
    if (pre) { pre.push(line); continue; }
    let m;
    if ((m = line.match(/^## (.*)$/)))          { closeList(); out += `<h2>${inl(m[1])}</h2>`; }
    else if ((m = line.match(/^### (.*)$/)))    { closeList(); out += `<h3>${inl(m[1])}</h3>`; }
    else if ((m = line.match(/^- (.*)$/))) {
      if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; }
      out += `<li>${inl(m[1])}</li>`;
    }
    else if ((m = line.match(/^\d+\. (.*)$/))) {
      if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; }
      out += `<li>${inl(m[1])}</li>`;
    }
    else if ((m = line.match(CALLOUT_RE)))      { closeList(); out += `<div class="cms-callout" data-callout="${m[1].toUpperCase()}">${inl(m[2])}</div>`; }
    else if ((m = line.match(/^> (.*)$/)))      { closeList(); out += `<blockquote>${inl(m[1])}</blockquote>`; }
    else if ((m = line.trim().match(/^\[img(\d+)\]$/i))) { closeList(); out += imgChip(m[1]); }
    else if (line.trim() === '')                { closeList(); out += '<p><br></p>'; }
    else                                        { closeList(); out += `<p>${inlineMd(line)}</p>`; }
  }
  if (pre) out += `<pre>${esc(pre.join('\n'))}</pre>`; // unterminated fence: keep the text
  closeList();
  return out || '<p><br></p>';
}

// ─────────────────────────────────────────────────────────────────────────
//  Editor DOM → markdown lines
// ─────────────────────────────────────────────────────────────────────────

/** Inline nodes → markdown. <br> becomes "\n" (split into lines by the caller). */
export function inlineToMd(node) {
  let s = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { s += n.nodeValue.replace(/ /g, ' '); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (tag === 'BR') { s += '\n'; continue; }
    if (tag === 'CODE') { s += n.textContent ? '`' + n.textContent + '`' : ''; continue; }
    const inner = inlineToMd(n);
    if (!inner.trim()) { s += inner; continue; }
    if (tag === 'STRONG' || tag === 'B')                     s += `**${inner}**`;
    else if (tag === 'EM' || tag === 'I')                    s += `*${inner}*`;
    else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') s += `~~${inner}~~`;
    else if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      s += /^https?:\/\/[^\s)]+$/i.test(href) ? `[${inner}](${href})` : inner; // only links the site renders
    }
    else s += inner; // span/font/u/mark etc.: keep the text, drop styling
  }
  return s;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'SECTION', 'ARTICLE']);
const hasBlockChild = el => [...el.children].some(c => BLOCK_TAGS.has(c.tagName) || c.classList.contains('cms-img'));
// A block's inline text as one or more lines (a <br> inside a paragraph = new line)
const blockLines = el => inlineToMd(el).replace(/\n$/, '').split('\n');

function blockToLines(el, out) {
  if (el.nodeType === 3) { const t = el.nodeValue.replace(/ /g, ' '); if (t.trim()) out.push(t); return; }
  if (el.nodeType !== 1) return;
  const tag = el.tagName;
  if (el.classList.contains('cms-img')) { out.push(`[img${el.dataset.img}]`); return; }
  if (el.classList.contains('cms-callout')) {
    const text = inlineToMd(el).replace(/\n/g, ' ').trim();
    out.push(`> [!${el.dataset.callout || 'NOTE'}]${text ? ' ' + text : ''}`);
    return;
  }
  if (tag === 'H1' || tag === 'H2') { out.push('## ' + inlineToMd(el).replace(/\n/g, ' ').trim()); return; }
  if (/^H[3-6]$/.test(tag))          { out.push('### ' + inlineToMd(el).replace(/\n/g, ' ').trim()); return; }
  if (tag === 'PRE') {
    const body = el.textContent.replace(/\n$/, '');
    out.push('```', ...(body ? body.split('\n') : []), '```');
    return;
  }
  if (tag === 'UL' || tag === 'OL') {
    let i = 0;
    for (const li of el.children) {
      if (li.tagName !== 'LI') { blockToLines(li, out); continue; }
      // nested lists are flattened (the site renders one level)
      const nested = [...li.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL');
      nested.forEach(n => n.remove());
      for (const text of blockLines(li)) {
        if (!text.trim() && !li.textContent.trim()) continue;
        out.push(tag === 'UL' ? `- ${text}` : `${++i}. ${text}`);
      }
      nested.forEach(n => { li.appendChild(n); blockToLines(n, out); });
    }
    return;
  }
  if (tag === 'BLOCKQUOTE') {
    if (hasBlockChild(el)) { for (const c of el.childNodes) { const sub = []; blockToLines(c, sub); sub.forEach(l => out.push(l ? `> ${l.replace(/^> /, '')}` : '')); } }
    else blockLines(el).forEach(l => out.push(`> ${l}`));
    return;
  }
  if (hasBlockChild(el)) { for (const c of el.childNodes) blockToLines(c, out); return; }
  blockLines(el).forEach(l => out.push(l.replace(/\s+$/, '')));
}

export function editorToLines(root) {
  const out = [];
  for (const c of root.childNodes) blockToLines(c, out);
  while (out.length && !out[out.length - 1].trim()) out.pop();
  while (out.length && !out[0].trim()) out.shift();
  return out;
}

/** Normalise whatever is in the Sheet-format pane (pipes optional). */
export const normaliseSheetText = text => linesToSheet(sheetToLines(text));

// ─────────────────────────────────────────────────────────────────────────
//  Mount: editor + toolbar + two-way sync
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {object} o
 * @param {HTMLElement} o.visual    contenteditable element
 * @param {HTMLTextAreaElement} o.source  Sheet-format textarea
 * @param {HTMLElement} o.toolbar
 * @param {string} o.content        Sheet cell value (loaded verbatim into source)
 * @param {() => void} [o.onChange] called on any user edit
 * @param {() => number} [o.nextImage] next free [imgN] number
 * @returns {{ getContent: () => string, destroy: () => void }}
 */
export function mountEditor({ visual, source, toolbar, content = '', onChange = () => {}, nextImage }) {
  const cleanups = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };

  source.value = content; // verbatim: unedited posts save byte-for-byte identical
  const renderVisual = () => { visual.innerHTML = linesToEditorHTML(sheetToLines(source.value)); };
  renderVisual();
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  try { document.execCommand('styleWithCSS', false, false); } catch {}

  let tVisual, tSource;
  let touched = false; // until the user edits, save returns the original cell untouched
  const syncFromVisual = () => {
    const text = linesToSheet(editorToLines(visual));
    if (text !== normaliseSheetText(source.value)) source.value = text;
  };
  on(visual, 'input', () => { touched = true; onChange(); clearTimeout(tVisual); tVisual = setTimeout(syncFromVisual, 150); });
  on(source, 'input', () => { touched = true; onChange(); clearTimeout(tSource); tSource = setTimeout(renderVisual, 300); });

  // ── Keyboard: keep every block a single markdown line ─────────────────
  const currentBlock = () => {
    const sel = getSelection();
    if (!sel.rangeCount || !visual.contains(sel.anchorNode)) return null;
    let n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode;
    while (n && n.parentNode !== visual) n = n.parentNode;
    return n;
  };
  const placeCaret = (el, atEnd = false) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(!atEnd);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  };
  const insertParagraphAfter = block => {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    block.after(p);
    placeCaret(p);
    return p;
  };

  on(visual, 'keydown', e => {
    if (e.key === 'Enter') {
      const block = currentBlock();
      if (!block) return;
      if (block.tagName === 'PRE') { e.preventDefault(); document.execCommand('insertText', false, '\n'); return; }
      if (e.shiftKey) { e.preventDefault(); document.execCommand('insertParagraph'); return; } // no soft breaks in the format
      // Callouts and quotes are one line each: Enter continues below in a paragraph
      if (block.classList?.contains('cms-callout') || block.tagName === 'BLOCKQUOTE' || block.classList?.contains('cms-img')) {
        e.preventDefault();
        insertParagraphAfter(block);
        visual.dispatchEvent(new Event('input'));
      }
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i') { e.preventDefault(); cmd(k === 'b' ? 'bold' : 'italic'); }
      if (k === 'k') { e.preventDefault(); insertLink(); }
    }
  });

  // ── Paste: plain text only; pasted markdown becomes formatting ────────
  on(visual, 'paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'));
    touched = true;
    syncFromVisual();
    if (/\n|^(#{2,3} |- |\d+\. |> )|\*\*|`|\[.+\]\(https?:/.test(text)) renderVisual(); // apply pasted markdown
    onChange();
  });

  // ── Toolbar actions ───────────────────────────────────────────────────
  function cmd(name, value = null) {
    visual.focus();
    document.execCommand(name, false, value);
    visual.dispatchEvent(new Event('input'));
    refreshState();
  }

  function setBlock(tag) {
    visual.focus();
    const block = currentBlock();
    if (block && (block.classList?.contains('cms-callout'))) {
      const el = document.createElement(tag);
      el.innerHTML = block.innerHTML || '<br>';
      block.replaceWith(el); placeCaret(el, true);
      visual.dispatchEvent(new Event('input'));
      return;
    }
    cmd('formatBlock', tag);
  }

  function toCallout(type) {
    visual.focus();
    let block = currentBlock();
    if (!block) { visual.insertAdjacentHTML('beforeend', '<p><br></p>'); block = visual.lastChild; }
    if (block.classList?.contains('cms-img') || block.tagName === 'PRE') block = insertParagraphAfter(block);
    let html = block.innerHTML;
    if (block.tagName === 'UL' || block.tagName === 'OL') {
      const li = getSelection().anchorNode?.parentElement?.closest('li');
      html = li ? li.innerHTML : '';
    }
    const div = document.createElement('div');
    div.className = 'cms-callout';
    div.dataset.callout = type;
    div.innerHTML = html && html !== '<br>' ? html : '<br>';
    block.replaceWith(div);
    placeCaret(div, true);
    visual.dispatchEvent(new Event('input'));
  }

  function insertBlockAfterCurrent(html) {
    visual.focus();
    const block = currentBlock();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const nodes = [...tmp.childNodes];
    if (block) block.after(...nodes); else visual.append(...nodes);
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    nodes[nodes.length - 1].after(after);
    placeCaret(after);
    visual.dispatchEvent(new Event('input'));
  }

  function insertImage() {
    const used = [...visual.querySelectorAll('.cms-img')].map(c => +c.dataset.img || 0);
    const n = nextImage ? nextImage(used) : Math.max(0, ...used) + 1;
    insertBlockAfterCurrent(imgChip(n));
  }

  function insertLink() {
    visual.focus();
    const sel = getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const url = (prompt('Link URL (must start with https://):', 'https://') || '').trim();
    if (!url || url === 'https://') return;
    if (!/^https?:\/\/[^\s)]+$/i.test(url)) { alert('Links must start with http:// or https:// and contain no spaces or ")".'); return; }
    visual.focus();
    if (range) { sel.removeAllRanges(); sel.addRange(range); }
    if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
    else document.execCommand('createLink', false, url);
    visual.dispatchEvent(new Event('input'));
  }

  function inlineCode() {
    visual.focus();
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const text = sel.toString().replace(/`/g, '');
    document.execCommand('insertHTML', false, `<code>${esc(text)}</code>`);
    visual.dispatchEvent(new Event('input'));
  }

  // ── Toolbar UI ────────────────────────────────────────────────────────
  toolbar.innerHTML = '';
  let openMenu = null;
  const closeMenu = () => { if (openMenu) { openMenu.menu.hidden = true; openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } };
  on(document, 'click', e => { if (openMenu && !openMenu.wrap.contains(e.target)) closeMenu(); });
  on(document, 'keydown', e => { if (e.key === 'Escape') closeMenu(); });

  const button = (label, title, fn, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cms-tb-btn ${cls}`.trim();
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = label;
    b.addEventListener('mousedown', e => e.preventDefault()); // keep the text selection
    b.addEventListener('click', fn);
    return b;
  };
  const group = (...btns) => { const g = document.createElement('div'); g.className = 'tb-btn-group'; g.append(...btns); return g; };
  const sep = () => { const s = document.createElement('span'); s.className = 'cms-tb-sep'; return s; };
  const dropdown = (label, title, items, menuClass = 'tb-dropdown-menu') => {
    const wrap = document.createElement('div');
    wrap.className = 'tb-dropdown-wrap';
    const menu = document.createElement('div');
    menu.className = menuClass;
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    const btn = button(label, title, () => {
      if (openMenu && openMenu.menu === menu) { closeMenu(); return; }
      closeMenu();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      openMenu = { menu, btn, wrap };
    });
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    for (const it of items) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `tb-dropdown-item ${it.cls || ''}`.trim();
      item.setAttribute('role', 'menuitem');
      item.innerHTML = it.label;
      item.addEventListener('mousedown', e => e.preventDefault());
      item.addEventListener('click', () => { closeMenu(); it.fn(); });
      menu.appendChild(item);
    }
    wrap.append(btn, menu);
    return { wrap, btn };
  };

  const blockMenu = dropdown('<span class="tb-size-label">Paragraph</span><span class="tb-caret">▾</span>', 'Text style', [
    { label: 'Paragraph', cls: 'tb-size-p',  fn: () => setBlock('p') },
    { label: 'Heading 2', cls: 'tb-size-h2', fn: () => setBlock('h2') },
    { label: 'Heading 3', cls: 'tb-size-h3', fn: () => setBlock('h3') },
  ]);
  const bBold   = button('<b>B</b>', 'Bold (Ctrl+B)', () => cmd('bold'), 'tb-bold');
  const bItalic = button('<i>I</i>', 'Italic (Ctrl+I)', () => cmd('italic'), 'tb-italic');
  const bStrike = button('<s>S</s>', 'Strikethrough', () => cmd('strikeThrough'), 'tb-strike');
  const calloutMenu = dropdown('Callout ▾', 'Insert callout',
    Object.entries(CALLOUTS).map(([t, label]) => ({ label, cls: `tb-callout-${t.toLowerCase()}`, fn: () => toCallout(t) })),
    'tb-dropdown-menu tb-callout-menu');
  const SPECIAL = ['—', '–', '…', '“', '”', '‘', '’', '©', '®', '™', '→', '←', '↑', '↓', '✓', '✗', '•', '·', '°', '₹', '€', '£'];
  const specialMenu = dropdown('Ω', 'Special characters',
    SPECIAL.map(ch => ({ label: ch, cls: 'tb-special-char', fn: () => cmd('insertText', ch) })), 'tb-special-panel');

  toolbar.append(
    blockMenu.wrap, sep(),
    group(bBold, bItalic, bStrike, button('<code>`</code>', 'Inline code (select text first)', inlineCode)), sep(),
    group(button('•', 'Bullet list', () => cmd('insertUnorderedList')),
          button('1.', 'Numbered list', () => cmd('insertOrderedList')),
          button('❝', 'Quote', () => setBlock('blockquote')),
          button('{ }', 'Code block', () => insertBlockAfterCurrent('<pre>code here</pre>'))), sep(),
    group(button('🔗', 'Link (Ctrl+K)', insertLink), button('[img]', 'Image placeholder — fill the URL under "Inline Images"', insertImage)), sep(),
    calloutMenu.wrap, sep(), specialMenu.wrap,
  );

  // Active-state highlighting
  const blockLabel = blockMenu.btn.querySelector('.tb-size-label');
  function refreshState() {
    if (!visual.contains(getSelection().anchorNode)) return;
    try {
      bBold.classList.toggle('active', document.queryCommandState('bold'));
      bItalic.classList.toggle('active', document.queryCommandState('italic'));
      bStrike.classList.toggle('active', document.queryCommandState('strikeThrough'));
    } catch {}
    const b = currentBlock();
    blockLabel.textContent = b?.tagName === 'H2' ? 'Heading 2' : b?.tagName === 'H3' ? 'Heading 3' : 'Paragraph';
  }
  on(document, 'selectionchange', refreshState);

  return {
    /** Content to save: the original cell if untouched, else the normalised Sheet-format pane. */
    getContent() {
      if (!touched) return content;
      clearTimeout(tVisual);
      if (document.activeElement === visual) syncFromVisual();
      return normaliseSheetText(source.value);
    },
    destroy() { cleanups.forEach(f => f()); closeMenu(); },
  };
}
