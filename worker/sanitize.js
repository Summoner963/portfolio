// worker/sanitize.js
// Allow-list sanitiser for the Sheet's optional Table_HTML cell, built on the
// Workers HTMLRewriter (a real streaming HTML parser — no regex parsing).
// Mirrors sanitizeHTML() in public/js/utils.js (DOMParser) for the browser.

import { safeUrl } from '../public/js/shared/render.js';

const ALLOWED = new Set([
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'strong', 'em', 'b', 'i', 'br', 'p', 'ul', 'ol', 'li', 'a', 'span', 'code', 'pre', 'blockquote',
]);
// Removed together with their content
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form', 'textarea', 'select', 'title', 'head']);
const CELL_ATTRS = new Set(['colspan', 'rowspan', 'scope']);

/** @param {string} raw @returns {Promise<string>} */
export async function sanitizeHTML(raw) {
  if (!raw) return '';
  const rw = new HTMLRewriter()
    .on('*', {
      element(el) {
        const tag = el.tagName;
        if (DROP.has(tag)) { el.remove(); return; }
        if (!ALLOWED.has(tag)) { el.removeAndKeepContent(); return; }
        for (const [name] of [...el.attributes]) {
          const keep = (tag === 'a' && name === 'href') || ((tag === 'th' || tag === 'td') && CELL_ATTRS.has(name));
          if (!keep) el.removeAttribute(name);
        }
        if (tag === 'a') {
          const href = safeUrl(el.getAttribute('href'));
          if (/^https?:/i.test(href) && !/["<>\s]/.test(href)) el.setAttribute('href', href);
          else el.removeAttribute('href');
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
        if ((tag === 'th' || tag === 'td')) {
          for (const n of CELL_ATTRS) {
            const v = el.getAttribute(n);
            if (v != null && !/^[a-z0-9]{1,8}$/i.test(v)) el.removeAttribute(n);
          }
        }
      },
      comments(c) { c.remove(); },
    })
    .onDocument({ doctype(d) { d.remove?.(); } });
  return rw.transform(new Response(raw, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })).text();
}
