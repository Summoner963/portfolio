/**
 * worker/ssr/chords.js
 *
 * SSR prerender for chord detail pages (/chords/:slug).
 * Called by worker/index.js for bot/crawler requests.
 *
 * Exports:
 *   prerenderChord(slug, env, request, fetchSheetData)
 *
 * Features:
 *   - Full static HTML with all meta tags for crawlers
 *   - MusicComposition schema (schema.org/MusicComposition)
 *   - BreadcrumbList schema
 *   - Person schema
 *   - Tab content rendered as readable pre-formatted text via renderTabSSR()
 *     (renderTabSSR is already implemented in worker/utils.js — not redefined here)
 *   - True HTTP 404 + noindex,nofollow for missing slugs
 *   - Hydration script redirects real users back to the SPA
 *   - Security headers applied via SECURITY_HEADERS from worker/ssr/meta.js
 *
 * Dependencies:
 *   ../utils.js  → escHtml, escJson, fixImgUrl, renderTabSSR
 *   ./meta.js    → SITE_URL, PRERENDER_CSS, SECURITY_HEADERS,
 *                  preNavHTML, preFooterHTML, hydrationScript,
 *                  htmlCacheHeaders
 */

import {
  escHtml,
  escJson,
  fixImgUrl,
  renderTabSSR,
} from '../utils.js';

import {
  SITE_URL,
  PRERENDER_CSS,
  SECURITY_HEADERS,
  preNavHTML,
  preFooterHTML,
  hydrationScript,
  htmlCacheHeaders,
} from './meta.js';

// ─────────────────────────────────────────────────────────────────────────
//  CHORD-SPECIFIC PRERENDER CSS
//  Minimal styles for the static chord page — just enough so bots and
//  users-before-hydration see readable, styled content.
//  All tokens come from PRERENDER_CSS which is already included.
// ─────────────────────────────────────────────────────────────────────────
const CHORD_PRERENDER_CSS = `
/* ── Chord detail page — SSR styles ── */
.pre-chord-wrap{max-width:760px;margin:0 auto;padding:5rem 4rem}
.pre-chord-back{
  display:inline-flex;align-items:center;gap:.5rem;
  font-family:var(--mono);font-size:.72rem;color:var(--accent);
  text-decoration:none;margin-bottom:2.4rem;letter-spacing:.05em;
}
.pre-chord-back:hover{color:var(--accent2);text-decoration:underline}
.pre-chord-breadcrumb{
  font-family:var(--mono);font-size:.7rem;color:var(--muted-light);
  letter-spacing:.06em;margin-bottom:1.8rem;
  display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;
}
.pre-chord-breadcrumb a{color:var(--accent);text-decoration:none}
.pre-chord-title{
  font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.8rem);
  line-height:1.1;margin-bottom:.5rem;color:var(--accent2)
}
.pre-chord-artist{
  font-family:var(--sans);font-size:1rem;color:var(--muted);
  margin-bottom:1.4rem;
}
.pre-chord-artist em{font-style:italic}
.pre-chord-cover{
  width:100%;max-height:360px;object-fit:cover;
  border-radius:.7rem;border:1.5px solid var(--border);
  margin-bottom:1.8rem;display:block;aspect-ratio:16/9
}
.pre-chord-meta{
  display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;
  font-family:var(--mono);font-size:.72rem;color:var(--muted);
  margin-bottom:1.4rem;padding:.9rem 1.1rem;
  background:var(--accent-bg);border:1.5px solid rgba(45,106,79,.18);
  border-radius:.6rem;
}
.pre-chord-meta span{display:flex;gap:.35rem;align-items:center}
.pre-chord-meta strong{color:var(--accent2)}
.pre-chord-badges{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.2rem}
.pre-chord-badge{
  font-family:var(--mono);font-size:.68rem;padding:.22rem .65rem;
  border-radius:.25rem;letter-spacing:.04em;
}
.pre-chord-badge-diff-beginner{background:#d1fae5;color:#065f46;border:1px solid #6ee7b7}
.pre-chord-badge-diff-intermediate{background:#fef3c7;color:#92400e;border:1px solid #fbbf24}
.pre-chord-badge-diff-advanced{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.pre-chord-badge-cat{background:var(--accent-bg);color:var(--accent);border:1px solid rgba(45,106,79,.2)}
.pre-chord-badge-key{background:var(--surface);color:var(--muted);border:1px solid var(--border)}
.pre-chord-intro{
  color:var(--muted);font-size:.92rem;line-height:1.75;
  margin-bottom:1.4rem;
}
.pre-chord-used{
  display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;
  margin-bottom:1.8rem;font-family:var(--mono);font-size:.75rem;
}
.pre-chord-used-label{color:var(--muted);font-weight:500;letter-spacing:.06em}
.pre-chord-used-pill{
  background:var(--accent-bg);color:var(--accent);
  border:1.5px solid rgba(45,106,79,.25);border-radius:.3rem;
  padding:.18rem .55rem;font-family:var(--mono);font-size:.7rem;letter-spacing:.04em;
}
.pre-tab-container{
  margin-top:2rem;padding:1.6rem 1.4rem;
  background:var(--surface);border:1.5px solid var(--border);
  border-radius:.8rem;overflow-x:auto;
}
.pre-tab-heading{
  font-family:var(--mono);font-size:.68rem;color:var(--muted);
  letter-spacing:.1em;text-transform:uppercase;margin-bottom:1rem;
  font-weight:500;
}
.pre-tab-body{
  font-family:var(--mono);font-size:.85rem;line-height:1.9;
  white-space:pre;overflow-x:auto;color:var(--text);
}
.pre-tab-body .chord-name{
  color:var(--accent);font-weight:600;font-size:.82rem;
}
.pre-chord-notice{
  margin-top:2rem;padding:1rem 1.2rem;
  background:var(--accent-bg);border:1px solid rgba(45,106,79,.2);
  border-radius:.5rem;font-family:var(--mono);font-size:.72rem;
  color:var(--muted);letter-spacing:.04em;text-align:center;
}
@media(max-width:768px){
  .pre-chord-wrap{padding:3.5rem 1.5rem}
}
@media(max-width:480px){
  .pre-chord-wrap{padding:2.5rem 1.2rem}
  .pre-chord-meta{font-size:.68rem}
}
`;

// ─────────────────────────────────────────────────────────────────────────
//  DIFFICULTY BADGE CSS CLASS HELPER
// ─────────────────────────────────────────────────────────────────────────
function diffBadgeClass(diff) {
  switch ((diff || '').toLowerCase()) {
    case 'beginner':     return 'pre-chord-badge pre-chord-badge-diff-beginner';
    case 'intermediate': return 'pre-chord-badge pre-chord-badge-diff-intermediate';
    case 'advanced':     return 'pre-chord-badge pre-chord-badge-diff-advanced';
    default:             return 'pre-chord-badge pre-chord-badge-key';
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  404 HTML — returned for missing chord slugs
// ─────────────────────────────────────────────────────────────────────────
function build404HTML(slug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chord Sheet Not Found | Suman Dangal</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">
  <style>
    ${PRERENDER_CSS}
    body{display:grid;place-items:center;min-height:100vh;text-align:center;padding:2rem}
    .nf-code{font-family:var(--serif);font-size:6rem;color:var(--accent);opacity:.12;line-height:1;display:block;margin-bottom:.5rem}
    .nf-title{font-family:var(--serif);font-size:2rem;color:var(--accent2);margin-bottom:.8rem}
    .nf-msg{color:var(--muted);font-size:.9rem;max-width:400px;margin:0 auto 2rem}
    .nf-link{display:inline-flex;align-items:center;gap:.5rem;padding:.8rem 1.8rem;background:var(--accent);color:#fff;border-radius:.4rem;font-family:var(--mono);font-size:.8rem;text-decoration:none;letter-spacing:.05em}
    .nf-link:hover{background:var(--accent2)}
  </style>
</head>
<body>
  <div>
    <span class="nf-code" aria-hidden="true">404</span>
    <h1 class="nf-title">Chord Sheet Not Found</h1>
    <p class="nf-msg">No chord sheet with slug
      <code style="font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:.12rem .4rem;border-radius:.25rem">${escHtml(slug)}</code>
      exists.
    </p>
    <a href="${SITE_URL}/chords" class="nf-link">← Browse all chord sheets</a>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — prerenderChord
// ─────────────────────────────────────────────────────────────────────────

/**
 * Prerender a chord detail page as full static HTML for bots/crawlers.
 *
 * @param {string}   slug           - URL slug of the chord sheet
 * @param {object}   env            - Cloudflare env bindings
 * @param {Request}  request        - incoming Request object
 * @param {Function} fetchSheetData - async (sheetName, env) => row[] — passed in from index.js
 * @returns {Response}
 */
export async function prerenderChord(slug, env, request, fetchSheetData) {
  // ── Fetch chord rows ───────────────────────────────────────────────────
  let rows;
  try {
    rows = await fetchSheetData('chords', env);
  } catch (e) {
    console.warn('[prerenderChord] fetch failed:', e.message);
    rows = [];
  }

  const post = rows?.find(r => (r.Slug || '').trim() === slug);

  // ── 404 for missing slug ───────────────────────────────────────────────
  if (!post) {
    const headers = new Headers({ 'Content-Type': 'text/html;charset=UTF-8' });
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(build404HTML(slug), { status: 404, headers });
  }

  // ── Data extraction ────────────────────────────────────────────────────
  const title         = (post.Title         || '').trim();
  const artist        = (post.Artist        || '').trim();
  const album         = (post.Album         || '').trim();
  const year          = (post.Year          || '').trim();
  const key           = (post.Key           || '').trim();
  const capo          = (post.Capo          || '').trim();
  const bpm           = (post.BPM           || '').trim();
  const timeSig       = (post.Time_Signature|| '').trim();
  const tuning        = (post.Tuning        || '').trim();
  const difficulty    = (post.Difficulty    || '').trim();
  const category      = (post.Category     || '').trim();
  const tags          = (post.Tags          || '').split(',').map(t => t.trim()).filter(Boolean);
  const introText     = (post.Intro_Text    || '').trim();
  const chordsUsed    = (post.Chords_Used   || '').split(',').map(c => c.trim()).filter(Boolean);
  const tabContent    = (post.Tab_Content   || '').trim();
  const dateAdded     = (post.Date_Added    || '').trim();
  const excerpt       = (post.Excerpt       || '').trim();
  const imageUrl      = fixImgUrl(post.Image_URL || '');
  const imageAlt      = (post.Image_Alt     || `${title} chord sheet`).trim();

  const pageUrl       = `${SITE_URL}/chords/${escHtml(slug)}`;
  const pageTitle     = `${title} — ${artist} Chords`;
  const metaDesc      = excerpt || `Guitar chords for ${title} by ${artist}.${key ? ` Key of ${key}.` : ''}${capo && capo !== '0' ? ` Capo ${capo}.` : ''}`;

  // ── MusicComposition structured data ──────────────────────────────────
  const musicSchema = {
    '@context':     'https://schema.org',
    '@type':        'MusicComposition',
    name:            title,
    description:     metaDesc,
    url:             pageUrl,
    inLanguage:      'en',
    ...(artist   ? { composer: { '@type': 'Person', name: artist } } : {}),
    ...(album    ? { includedInMusicPlaylist: { '@type': 'MusicPlaylist', name: album } } : {}),
    ...(dateAdded ? { datePublished: dateAdded } : {}),
    ...(imageUrl  ? { image: { '@type': 'ImageObject', url: imageUrl } } : {}),
    ...(tags.length ? { keywords: tags.join(', ') } : {}),
    ...(key       ? { musicalKey: key } : {}),
  };

  // ── BreadcrumbList structured data ────────────────────────────────────
  const breadcrumbSchema = {
    '@context':    'https://schema.org',
    '@type':       'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',         item: `${SITE_URL}/`        },
      { '@type': 'ListItem', position: 2, name: 'Chord Sheets', item: `${SITE_URL}/chords`  },
      { '@type': 'ListItem', position: 3, name: pageTitle,      item: pageUrl               },
    ],
  };

  // ── Person structured data ─────────────────────────────────────────────
  const personSchema = {
    '@context': 'https://schema.org',
    '@type':    'Person',
    name:        'Suman Dangal',
    url:         `${SITE_URL}/`,
    email:       'sumandangal888@gmail.com',
    jobTitle:    'Dev & QA Engineer',
    address:     { '@type': 'PostalAddress', addressLocality: 'Bhaktapur', addressCountry: 'NP' },
    sameAs:      ['https://linkedin.com/in/sumandangal963'],
  };

  // ── Render tab content via the already-built renderTabSSR() ───────────
  // renderTabSSR converts [G]-notation → <span class="chord-name">G</span>
  // for crawler readability. It lives in worker/utils.js.
  const renderedTab = renderTabSSR(tabContent);

  // ── Badge HTML helpers ─────────────────────────────────────────────────
  const diffBadge = difficulty
    ? `<span class="${diffBadgeClass(difficulty)}">${escHtml(difficulty)}</span>` : '';
  const catBadge  = category
    ? `<span class="pre-chord-badge pre-chord-badge-cat">${escHtml(category)}</span>` : '';
  const tagBadges = tags.map(t =>
    `<span class="pre-chord-badge pre-chord-badge-key">${escHtml(t)}</span>`
  ).join('');

  // ── Meta row items ─────────────────────────────────────────────────────
  const metaItems = [
    key                              ? `<span>Key <strong>${escHtml(key)}</strong></span>`              : '',
    capo && capo !== '0'             ? `<span>Capo <strong>${escHtml(capo)}</strong></span>`            : '',
    bpm                              ? `<span>BPM <strong>${escHtml(bpm)}</strong></span>`              : '',
    timeSig                          ? `<span>Time <strong>${escHtml(timeSig)}</strong></span>`         : '',
    tuning                           ? `<span>Tuning <strong>${escHtml(tuning)}</strong></span>`        : '',
    dateAdded                        ? `<span>Added <strong>${escHtml(dateAdded)}</strong></span>`      : '',
  ].filter(Boolean).join('\n          ');

  // ── Cover image ────────────────────────────────────────────────────────
  const coverHTML = imageUrl
    ? `<img class="pre-chord-cover"
         src="${escHtml(imageUrl)}"
         alt="${escHtml(imageAlt)}"
         width="1200" height="675"
         loading="eager"
         decoding="async"
         fetchpriority="high">`
    : '';

  // ── Artist / album / year line ─────────────────────────────────────────
  const artistLine = [
    artist,
    album ? `<em>${escHtml(album)}</em>` : '',
    year  ? escHtml(year) : '',
  ].filter(Boolean).join(' · ');

  // ── Chords-used pill strip ─────────────────────────────────────────────
  const chordsUsedHTML = chordsUsed.length
    ? `<div class="pre-chord-used">
        <span class="pre-chord-used-label">Chords:</span>
        ${chordsUsed.map(c =>
          `<span class="pre-chord-used-pill">${escHtml(c)}</span>`
        ).join('')}
      </div>` : '';

  // ── Intro text ─────────────────────────────────────────────────────────
  const introHTML = introText
    ? `<p class="pre-chord-intro">${escHtml(introText)}</p>` : '';

  // ── Full page HTML ─────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(pageTitle)} | Suman Dangal</title>
  <meta name="description" content="${escHtml(metaDesc)}">
  <meta name="robots" content="index, follow">
  ${tags.length ? `<meta name="keywords" content="${escHtml(tags.join(', '))}">` : ''}
  <link rel="canonical" href="${pageUrl}">
  <link rel="icon" type="image/x-icon" href="${SITE_URL}/favicon.ico">

  <!-- Open Graph -->
  <meta property="og:type"        content="music.song">
  <meta property="og:site_name"   content="Suman Dangal">
  <meta property="og:title"       content="${escHtml(pageTitle)} | Suman Dangal">
  <meta property="og:description" content="${escHtml(metaDesc)}">
  <meta property="og:url"         content="${pageUrl}">
  ${imageUrl
    ? `<meta property="og:image"        content="${escHtml(imageUrl)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="675">`
    : `<meta property="og:image"        content="${SITE_URL}/og.png">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">`
  }
  ${artist ? `<meta property="music:musician" content="${escHtml(artist)}">` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(pageTitle)} | Suman Dangal">
  <meta name="twitter:description" content="${escHtml(metaDesc)}">
  <meta name="twitter:image"       content="${escHtml(imageUrl || `${SITE_URL}/og.png`)}">

  <!-- Structured data: MusicComposition -->
  <script type="application/ld+json">
  ${JSON.stringify(musicSchema, null, 2)}
  <\/script>

  <!-- Structured data: BreadcrumbList -->
  <script type="application/ld+json">
  ${JSON.stringify(breadcrumbSchema, null, 2)}
  <\/script>

  <!-- Structured data: Person -->
  <script type="application/ld+json">
  ${JSON.stringify(personSchema, null, 2)}
  <\/script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style"
    href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap"
    onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap">
  </noscript>

  <style>
    ${PRERENDER_CSS}
    ${CHORD_PRERENDER_CSS}
  <\/style>
</head>
<body>

  ${preNavHTML({ active: '' })}

  <main class="pre-chord-wrap"
    itemscope itemtype="https://schema.org/MusicComposition">

    <meta itemprop="name"        content="${escHtml(title)}">
    <meta itemprop="description" content="${escHtml(metaDesc)}">
    ${artist ? `<meta itemprop="composer"    content="${escHtml(artist)}">` : ''}
    ${key    ? `<meta itemprop="musicalKey"  content="${escHtml(key)}">` : ''}

    <!-- Breadcrumb -->
    <div class="pre-chord-breadcrumb" aria-label="Breadcrumb">
      <a href="${SITE_URL}/">Home</a>
      <span aria-hidden="true">›</span>
      <a href="${SITE_URL}/chords">Chord Sheets</a>
      <span aria-hidden="true">›</span>
      <span>${escHtml(pageTitle)}</span>
    </div>

    <!-- Back link -->
    <a class="pre-chord-back" href="${SITE_URL}/chords">
      ← Back to Chord Sheets
    </a>

    <!-- Song header -->
    <h1 class="pre-chord-title" itemprop="name">${escHtml(title)}</h1>

    <div class="pre-chord-artist">
      ${artistLine}
    </div>

    ${coverHTML}

    <!-- Meta info row -->
    ${metaItems ? `<div class="pre-chord-meta" role="list" aria-label="Song details">
      ${metaItems}
    </div>` : ''}

    <!-- Badges -->
    ${(diffBadge || catBadge || tagBadges)
      ? `<div class="pre-chord-badges" aria-label="Tags and difficulty">
          ${catBadge}${diffBadge}${tagBadges}
        </div>` : ''
    }

    ${introHTML}
    ${chordsUsedHTML}

    <!-- Tab content -->
    ${tabContent
      ? `<div class="pre-tab-container" role="region" aria-label="Chord sheet tab">
          <div class="pre-tab-heading">Tab / Lyrics</div>
          <div class="pre-tab-body" itemprop="text">${renderedTab}</div>
        </div>` : ''
    }

    <!-- Notice for real users before SPA hydrates -->
    <p class="pre-chord-notice" aria-hidden="true">
      🎸 Loading interactive features — transpose, chord diagrams, and auto-scroll…
    </p>

    <!-- Author / curator line -->
    <div style="display:flex;align-items:center;gap:.8rem;font-family:var(--mono);
      font-size:.75rem;color:var(--muted-light);margin-top:2.5rem;
      padding-top:1.2rem;border-top:1px solid var(--border)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      <span>Curated by
        <a href="${SITE_URL}/about"
          style="color:var(--accent);text-decoration:none">Suman Dangal</a>
      </span>
    </div>

  </main>

  ${preFooterHTML()}

  <!-- Hydrate SPA for real users — bots keep the static HTML -->
  <script>
    ${hydrationScript()}
  <\/script>

</body>
</html>`;

  // ── Build response ─────────────────────────────────────────────────────
  const headers = new Headers({
    'Content-Type':  'text/html;charset=UTF-8',
    'Cache-Control': htmlCacheHeaders(),
  });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);

  return new Response(html, { status: 200, headers });
}