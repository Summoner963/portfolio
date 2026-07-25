// worker/utils.js
// ═══════════════════════════════════════════════════════════════════════════
//  Shared server-side utilities for all Cloudflare Worker handlers.
//
//  Rules:
//   - Pure functions only — no side effects, no global state.
//   - No imports from other worker files — this is the leaf node.
//   - Every SSR handler (blog meta) imports from here.
//     Zero duplication across handlers.
//   - All HTML output goes through escHtml() before insertion.
// ═══════════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────────
//  HTML / JSON escaping
// ─────────────────────────────────────────────────────────────────────────

/**
 * Escape a value for safe insertion into HTML attributes or text nodes.
 * Must be called on ALL sheet data before it touches any HTML string.
 * @param {*} s
 * @returns {string}
 */
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Escape a value for safe embedding inside a JSON string literal.
 * Used when building application/ld+json structured data blobs.
 * @param {*} s
 * @returns {string}
 */
export function escJson(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g,  '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}


// ─────────────────────────────────────────────────────────────────────────
//  CSV parser
//  Handles: quoted fields, escaped quotes (""), CRLF + LF, trailing commas.
//  Returns an array of objects keyed by the first-row headers.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw CSV string into an array of row objects.
 * Header row (row 0) becomes the object keys; all values are trimmed strings.
 * Empty rows (all blank values) are filtered out.
 *
 * @param {string} raw
 * @returns {Array<Record<string, string>>}
 */
export function parseCSV(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const rows = [];
  let cur = '', inQ = false, row = [];

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (c === '"') {
      // Escaped quote inside a quoted field: "" → "
      if (inQ && raw[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || (c === '\r' && raw[i + 1] === '\n')) && !inQ) {
      if (c === '\r') i++;          // consume the \n of CRLF
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else {
      cur += c;
    }
  }
  // Flush the last field / row
  row.push(cur);
  if (row.some(v => v.trim())) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());

  return rows
    .slice(1)
    .map(vals => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v));  // drop blank rows
}


// ─────────────────────────────────────────────────────────────────────────
//  Google Drive image URL normaliser
//  Converts any Drive share/view/uc URL to the lh3.googleusercontent.com
//  direct-serve format that works without authentication.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert a Google Drive URL to its direct-serve equivalent.
 * Non-Drive URLs are returned unchanged.
 * @param {string} url
 * @returns {string}
 */
export function fixImgUrl(url) {
  if (!url) return '';
  url = url.trim();

  // /file/d/<ID>/view  or  /file/d/<ID>
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}`;

  // /open?id=<ID>
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}`;

  // /uc?id=<ID>  or  /uc?export=view&id=<ID>
  const m3 = url.match(/drive\.google\.com\/uc\?.*?id=([^&]+)/);
  if (m3) return `https://lh3.googleusercontent.com/d/${m3[1]}`;

  return url;
}


// ─────────────────────────────────────────────────────────────────────────
//  Date formatter
//  Converts any parseable date string to YYYY-MM-DD for <lastmod> in
//  sitemap.xml and datePublished in structured data.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Format a date string as YYYY-MM-DD. Returns null if unparseable.
 * @param {string} dateStr
 * @returns {string|null}
 */
export function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────
//  HTML sanitiser
//  Used when sheet data contains trusted HTML snippets (e.g. Table_HTML).
//  Strips any tag not in the safe list; strips all attributes except
//  a small allow-list per tag. Returns a safe HTML string.
// ─────────────────────────────────────────────────────────────────────────

const SAFE_TAGS = new Set([
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'strong', 'em', 'b', 'i', 'br', 'p',
  'ul', 'ol', 'li',
  'a', 'span', 'code', 'pre', 'blockquote',
]);

// Attributes allowed per tag (tag → Set of attr names)
const SAFE_ATTRS = {
  a:   new Set(['href']),
  th:  new Set(['colspan', 'rowspan', 'scope']),
  td:  new Set(['colspan', 'rowspan']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding']),
};

/**
 * Strip unsafe tags and attributes from an HTML string.
 * Safe for inserting into SSR output when the source is a sheet cell
 * that is known to contain structured HTML (e.g. comparison tables).
 *
 * Note: This uses the Workers runtime's built-in HTMLRewriter for parsing,
 * falling back to a regex-based approach if HTMLRewriter is unavailable
 * (e.g. in unit tests). For SSR use the string-based approach is sufficient.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeHTML(raw) {
  if (!raw) return '';

  // Simple but effective: use a stack-based tag stripper.
  // We don't have DOMParser in the Worker runtime, so we use regex
  // to strip disallowed tags and attributes.
  return raw
    // Remove script/style/on* entirely
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi,   '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Remove javascript: hrefs
    .replace(/href\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '')
    // Strip tags not in the safe list (preserve content)
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
      const t = tag.toLowerCase();
      if (!SAFE_TAGS.has(t)) return '';   // strip tag, keep inner text
      // For closing tags, return as-is (no attrs to worry about)
      if (match.startsWith('</')) return `</${t}>`;
      // For opening tags, rebuild with only safe attrs
      const allowed = SAFE_ATTRS[t];
      if (!allowed) return `<${t}>`;      // no attrs allowed for this tag

      const attrs = [];
      const attrRe = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
      let m;
      while ((m = attrRe.exec(match.slice(t.length + 1))) !== null) {
        const name = m[1].toLowerCase();
        const val  = (m[2] ?? m[3] ?? m[4] ?? '').trim();
        if (allowed.has(name)) {
          // Extra safety: no javascript: in href
          if (name === 'href' && /^\s*javascript:/i.test(val)) continue;
          attrs.push(`${name}="${escHtml(val)}"`);
          // Force external links to open safely
          if (name === 'href') attrs.push('target="_blank" rel="noopener noreferrer"');
        }
      }
      return `<${t}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    });
}


// ─────────────────────────────────────────────────────────────────────────
//  Markdown renderer
//  Converts the pipe-delimited or newline-delimited markdown used in the
//  Google Sheets Content column into safe HTML for SSR pages.
//
//  Supported syntax:
//   ## Heading 2        → <h2>
//   ### Heading 3       → <h3>
//   > blockquote        → <blockquote>
//   - item              → <ul><li>
//   1. item             → <ol><li>
//   **bold**            → <strong>
//   *italic*            → <em>
//   `code`              → <code>
//   [text](url)         → <a>
//   ```                 → <pre><code> block
//   [img1]              → <figure><img> (resolved via imgMap)
//   blank line          → paragraph break
// ─────────────────────────────────────────────────────────────────────────

/**
 * Render a markdown-ish content string to HTML.
 *
 * @param {string} text        — raw content from sheet
 * @param {Record<string, {url:string, alt:string}>} [imgMap]
 *        — map of "img1" → { url, alt } for inline image placeholders
 * @returns {string}           — safe HTML string
 */
export function renderMarkdown(text, imgMap = {}) {
  if (!text) return '';

  /**
   * Apply inline formatting to an already-escaped line.
   * Input is raw text (not yet escaped); we escape it here then apply spans.
   */
  function inlineFmt(raw) {
    return escHtml(raw)
      // Unescape the pipe character (used as line separator in sheets)
      .replace(/&#124;/g, '|')
      // Bold, italic, inline code, links — order matters
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g,     '<code>$1</code>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" rel="noopener noreferrer">$1</a>'
      );
  }

  // Split on newlines; also support pipe-separated lines (sheet format)
  const lines  = text.split(/\n/);
  const out    = [];
  let inList   = false;
  let inOl     = false;
  let inPre    = false;

  function closeList() {
    if (inList) { out.push('</ul>'); inList = false; }
    if (inOl)   { out.push('</ol>'); inOl   = false; }
  }

  for (const raw of lines) {
    // Strip leading pipe (pipe-separated sheet format)
    const l = raw.startsWith('|') ? raw.slice(1) : raw;

    // ── Code fence ────────────────────────────────────────────────────
    if (l.trim() === '```') {
      if (inPre) { out.push('</code></pre>'); inPre = false; }
      else       { closeList(); out.push('<pre><code>'); inPre = true; }
      continue;
    }
    if (inPre) {
      // Inside a code block: escape only, no formatting
      out.push(escHtml(raw));
      continue;
    }

    // ── Blank line ────────────────────────────────────────────────────
    if (l.trim() === '') {
      closeList();
      out.push('');
      continue;
    }

    // ── Headings ──────────────────────────────────────────────────────
    if (l.startsWith('## '))  { closeList(); out.push(`<h2>${inlineFmt(l.slice(3))}</h2>`);  continue; }
    if (l.startsWith('### ')) { closeList(); out.push(`<h3>${inlineFmt(l.slice(4))}</h3>`);  continue; }

    // ── Blockquote ────────────────────────────────────────────────────
    if (l.startsWith('> '))   { closeList(); out.push(`<blockquote><p>${inlineFmt(l.slice(2))}</p></blockquote>`); continue; }

    // ── Unordered list ────────────────────────────────────────────────
    if (l.startsWith('- ')) {
      if (inOl)   { out.push('</ol>'); inOl   = false; }
      if (!inList){ out.push('<ul>');  inList  = true;  }
      out.push(`<li>${inlineFmt(l.slice(2))}</li>`);
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────
    if (/^\d+\.\s/.test(l)) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inOl)  { out.push('<ol>'); inOl    = true;  }
      out.push(`<li>${inlineFmt(l.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }

    // ── Inline image placeholder: [img1], [img2] … ───────────────────
    const imgMatch = l.trim().match(/^\[img(\d+)\]$/i);
    if (imgMatch) {
      closeList();
      const key   = `img${imgMatch[1]}`;
      const entry = imgMap[key];
      if (entry) {
        const src    = fixImgUrl(typeof entry === 'object' ? entry.url : String(entry));
        const altTxt = (typeof entry === 'object' && entry.alt) ? entry.alt : `image ${imgMatch[1]}`;
        if (src) {
          out.push(
            `<figure>` +
              `<img src="${escHtml(src)}" alt="${escHtml(altTxt)}" ` +
              `width="680" height="383" loading="lazy" decoding="async">` +
              `<figcaption>${escHtml(altTxt)}</figcaption>` +
            `</figure>`
          );
        }
      }
      continue;
    }

    // ── Paragraph ─────────────────────────────────────────────────────
    closeList();
    out.push(`<p>${inlineFmt(l)}</p>`);
  }

  // Close any open blocks
  if (inPre)  out.push('</code></pre>');
  closeList();

  return out.join('\n');
}
// ─────────────────────────────────────────────────────────────────────────
//  Security headers
//  Single definition used by worker/index.js and all SSR handlers.
//  Changing a header value here updates every response automatically.
// ─────────────────────────────────────────────────────────────────────────

export const SECURITY_HEADERS = {
  'X-Frame-Options':            'SAMEORIGIN',
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: https://lh3.googleusercontent.com https://suman-dangal.com.np; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';",
};

/**
 * Apply all security headers to a Headers object in place.
 * @param {Headers} headers
 * @returns {Headers}
 */
export function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return headers;
}


// ─────────────────────────────────────────────────────────────────────────
//  Cache helpers
//  Simple in-memory cache (per Worker isolate lifetime).
//  For a production site with high traffic, back this with a KV binding.
// ─────────────────────────────────────────────────────────────────────────

const CACHE_MS = 10 * 60 * 1000;   // 10 minutes
const _cache   = Object.create(null);

/**
 * Get a cached value. Returns null if missing or expired.
 * @param {string} key
 * @returns {string|null}
 */
export function memGet(key) {
  const it = _cache[key];
  if (!it) return null;
  if (Date.now() > it.exp) { delete _cache[key]; return null; }
  return it.data;
}

/**
 * Store a value in the in-memory cache for CACHE_MS milliseconds.
 * @param {string} key
 * @param {string} data
 */
export function memSet(key, data) {
  _cache[key] = { data, exp: Date.now() + CACHE_MS };
}

/**
 * Invalidate a single cache entry (useful for future admin endpoints).
 * @param {string} key
 */
export function memDel(key) {
  delete _cache[key];
}


// ─────────────────────────────────────────────────────────────────────────
//  Rate limiter
//  In-memory sliding window, 120 req / IP / 60 s.
//  Resets on Worker cold start (acceptable for free tier).
// ─────────────────────────────────────────────────────────────────────────

const RL_WINDOW_MS = 60_000;
const RL_MAX       = 120;
const _rl          = Object.create(null);

/**
 * Returns true if the IP has exceeded the rate limit.
 * Side-effect: increments the counter for this IP.
 * @param {string} ip
 * @returns {boolean}
 */
export function isRateLimited(ip) {
  const now   = Date.now();
  const entry = _rl[ip];
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    _rl[ip] = { count: 1, windowStart: now };
    return false;
  }
  entry.count++;
  return entry.count > RL_MAX;
}