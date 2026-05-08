/**
 * worker/ssr/blog.js — Suman Dangal Cloudflare Worker
 *
 * Exports:
 *   prerenderBlogPost(slug, env, request, fetchSheetData)
 */

import {
  escHtml,
  escJson,
  fixImgUrl,
  renderMarkdown,
  applySecurityHeaders,
} from '../utils.js';

import {
  SITE_URL,
  buildSSRHead,
  preNavHTML,
  preFooterHTML,
  hydrationScript,
  htmlCacheHeaders,
} from './meta.js';

export async function prerenderBlogPost(slug, env, request, fetchSheetData) {
  // ── Fetch all three sheets in parallel ───────────────────────────────
  // NOTE: 'blogimage' not 'images' — matches your actual sheet tab name
  const [blogRows, faqRows, imageRows] = await Promise.all([
    fetchSheetData('blog',       env).catch(() => []),
    fetchSheetData('faq',        env).catch(() => []),
    fetchSheetData('blogimage',  env).catch(() => []),
  ]);

  const post = (blogRows || []).find(r => (r.Slug || '').trim() === slug);

  // ── 404 ──────────────────────────────────────────────────────────────
  if (!post) {
    const html =
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
      `<title>Post Not Found | Suman Dangal</title>` +
      `<meta name="robots" content="noindex,nofollow">` +
      `<style>body{font-family:sans-serif;padding:2rem;text-align:center}` +
      `a{color:#2d6a4f}</style></head><body>` +
      `<h1>Post Not Found</h1>` +
      `<p>No post with slug <code>${escHtml(slug)}</code> exists.</p>` +
      `<a href="${SITE_URL}/blog">← Back to Blog</a>` +
      `</body></html>`;

    return new Response(html, {
      status:  404,
      headers: applySecurityHeaders(
        new Headers({ 'Content-Type': 'text/html;charset=UTF-8' })
      ),
    });
  }

  // ── Derive post fields ────────────────────────────────────────────────
  const title    = (post.Title    || '').trim();
  const excerpt  = (post.Excerpt  || '').trim();
  const date     = (post.Date     || '').trim();
  const category = (post.Category || 'Post').trim();
  const postUrl  = `${SITE_URL}/blog/${slug}`;
  const coverUrl = fixImgUrl(post.Image_URL || '');
  const coverAlt = (post.Image_Alt || `${title} — Suman Dangal blog`).trim();
  const tagList  = (post.Tags || '')
    .split(',').map(t => t.trim()).filter(Boolean);

  // ── Inline image map ─────────────────────────────────────────────────
  const imgMap = _buildImgMap(post, imageRows, slug);

  // ── Render markdown body ─────────────────────────────────────────────
  const bodyHTML = renderMarkdown(post.Content || '', imgMap);

  // ── FAQ rows for this post ───────────────────────────────────────────
  const faqItems = (faqRows || [])
    .filter(r => (r.Blog_Slug || '').trim() === slug)
    .sort((a, b) => Number(a.FAQ_Number || 0) - Number(b.FAQ_Number || 0))
    .map(r => ({
      q: (r.FAQ_Question || '').trim(),
      a: (r.FAQ_Answer   || '').trim(),
    }))
    .filter(p => p.q && p.a);

  // ── Structured data ───────────────────────────────────────────────────
  const blogPostingSchema = JSON.stringify({
    '@context':    'https://schema.org',
    '@type':       'BlogPosting',
    headline:       title,
    description:    excerpt,
    datePublished:  date,
    dateModified:   date,
    url:            postUrl,
    inLanguage:     'en',
    ...(tagList.length ? { keywords: tagList.join(', ') } : {}),
    ...(coverUrl ? {
      image: { '@type': 'ImageObject', url: coverUrl, width: 1200, height: 630 },
    } : {}),
    author: {
      '@type': 'Person',
      name:    'Suman Dangal',
      url:     `${SITE_URL}/`,
      sameAs:  ['https://linkedin.com/in/sumandangal963'],
    },
    publisher: {
      '@type': 'Person',
      name:    'Suman Dangal',
      url:     `${SITE_URL}/`,
    },
  });

  const breadcrumbSchema = JSON.stringify({
    '@context':      'https://schema.org',
    '@type':         'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: title,  item: postUrl },
    ],
  });

  const personSchema = JSON.stringify({
    '@context':  'https://schema.org',
    '@type':     'Person',
    name:         'Suman Dangal',
    url:          `${SITE_URL}/`,
    jobTitle:     'Dev & QA Engineer',
    email:        'sumandangal888@gmail.com',
    address: {
      '@type':         'PostalAddress',
      addressLocality:  'Bhaktapur',
      addressCountry:   'NP',
    },
    sameAs: ['https://linkedin.com/in/sumandangal963'],
  });

  const faqSchema = faqItems.length
    ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type':    'FAQPage',
        mainEntity:  faqItems.map(p => ({
          '@type':        'Question',
          name:            p.q,
          acceptedAnswer: { '@type': 'Answer', text: p.a },
        })),
      })
    : null;

  const schemas = [blogPostingSchema, breadcrumbSchema, personSchema];
  if (faqSchema) schemas.push(faqSchema);

  const extraMeta = [
    `<meta property="og:type" content="article">`,
    `<meta property="article:published_time" content="${escHtml(date)}">`,
    `<meta property="article:author" content="Suman Dangal">`,
    ...tagList.map(t => `<meta property="article:tag" content="${escHtml(t)}">`),
    ...(tagList.length
      ? [`<meta name="keywords" content="${escHtml(tagList.join(', '))}">`]
      : []),
  ];

  const headHTML = buildSSRHead({
    title,
    description: excerpt,
    canonical:   postUrl,
    ogImage:     coverUrl || `${SITE_URL}/og.png`,
    ogType:      'article',
    extraMeta,
    schemas,
  });

  const tagsHTML = tagList.length
    ? `<div class="pre-tags">${tagList.map(t =>
        `<span class="pre-tag">${escHtml(t)}</span>`
      ).join('')}</div>`
    : '';

  const coverHTML = coverUrl
    ? `<img class="pre-cover"
           src="${escHtml(coverUrl)}"
           alt="${escHtml(coverAlt)}"
           width="720" height="420"
           loading="eager" decoding="async" fetchpriority="high"
           itemprop="image">`
    : '';

  const faqHTML = faqItems.length
    ? `<div class="pre-faq">
        <h2>Frequently Asked Questions</h2>
        ${faqItems.map(f => `
        <details>
          <summary>${escHtml(f.q)}</summary>
          <div class="faq-answer">${escHtml(f.a)}</div>
        </details>`).join('')}
      </div>`
    : '';

  const authorHTML =
    `<div class="pre-author" itemscope itemtype="https://schema.org/Person">` +
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.5" aria-hidden="true">` +
    `<circle cx="12" cy="8" r="4"/>` +
    `<path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>` +
    `</svg>` +
    `<span>Written by ` +
    `<a href="${SITE_URL}/about" itemprop="url">` +
    `<span itemprop="name">Suman Dangal</span></a>` +
    `</span></div>`;

  const html = `${headHTML}
<body>

${preNavHTML('/blog')}

<main class="pre-main"
      itemscope itemtype="https://schema.org/BlogPosting">
  <meta itemprop="headline"      content="${escHtml(title)}">
  <meta itemprop="description"   content="${escHtml(excerpt)}">
  <meta itemprop="datePublished" content="${escHtml(date)}">
  <meta itemprop="url"           content="${escHtml(postUrl)}">

  <nav class="pre-breadcrumb" aria-label="Breadcrumb">
    <a href="${SITE_URL}/">Home</a>
    <span aria-hidden="true">\u203A</span>
    <a href="${SITE_URL}/blog">Blog</a>
    <span aria-hidden="true">\u203A</span>
    <span>${escHtml(title)}</span>
  </nav>

  <div class="pre-meta">
    <span class="pre-cat">${escHtml(category)}</span>
    <time datetime="${escHtml(date)}" itemprop="datePublished">
      ${escHtml(date)}
    </time>
  </div>

  <h1 class="pre-title" itemprop="name">${escHtml(title)}</h1>

  ${tagsHTML}
  ${coverHTML}

  <div class="pre-body" itemprop="articleBody">
    ${bodyHTML}
  </div>

  ${authorHTML}
  ${faqHTML}

  <hr style="border:none;border-top:1px solid var(--border);margin:2.5rem 0">

  <a href="${SITE_URL}/blog"
     style="display:inline-flex;align-items:center;gap:.5rem;
            font-family:var(--mono);font-size:.72rem;color:var(--muted);
            text-decoration:none;letter-spacing:.05em">
    \u2190 Back to all posts
  </a>
</main>

${preFooterHTML}
${hydrationScript}

</body>
</html>`;

  return new Response(html, {
    status:  200,
    headers: applySecurityHeaders(new Headers({
      'Content-Type':  'text/html;charset=UTF-8',
      'Cache-Control': htmlCacheHeaders(),
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  _buildImgMap — reads from blogimage sheet rows
//  Sheet columns: Blog_Slug | Img_Number | Img_URL | Img_Alt
// ─────────────────────────────────────────────────────────────────────────

function _buildImgMap(post, imageRows, slug) {
  const map = {};

  // Separate blogimage sheet rows
  if (imageRows && imageRows.length) {
    imageRows
      .filter(r => (r.Blog_Slug || '').trim() === slug)
      .sort((a, b) => Number(a.Img_Number || 0) - Number(b.Img_Number || 0))
      .forEach(r => {
        const num = Number(r.Img_Number || 0);
        if (!num || !r.Img_URL) return;
        map[`img${num}`] = {
          url: fixImgUrl((r.Img_URL || '').trim()),
          alt: (r.Img_Alt || '').trim(),
        };
      });
  }

  return map;
}