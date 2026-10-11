// worker/seo-files.js — files for crawlers, feed readers and AI agents:
//   /sitemap.xml  /robots.txt  /feed.xml  /llms.txt  /llms-full.txt  /blog/<slug>.md
// All generated from ROUTES, the Site tab and published posts, so they can't
// drift from the site.

import {
  SITE_URL, SITE_NAME, ROUTES, SITE_FIELD, esc, isoDate, plainExcerpt, postMarkdown,
  routeMeta, siteMap, splitList,
} from '../public/js/shared/render.js';
import { getRows } from './sheets.js';
import { sanitizeHTML } from './sanitize.js';

const text = (body, maxAge = 3600, extra = {}) => new Response(body, {
  headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': `public, max-age=${maxAge}`, ...extra },
});
const unavailable = () => new Response('Temporarily unavailable', {
  status: 503, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Retry-After': '120' },
});
const notFound = () => new Response('Not found', {
  status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
});

/** Site value, or the built-in text when the Site tab has no row for it. */
const sv = (site, key) => (Object.prototype.hasOwnProperty.call(site, key) ? site[key] : SITE_FIELD[key].def);
const plain = v => String(v || '').replace(/\*+/g, '').replace(/\s*\n\s*/g, ' ').trim();
const loadSite = async (env, ctx) => siteMap(await getRows('site', env, ctx));

// /api/ stays crawlable: Googlebot renders the SPA, which loads data from it
// (blocking it caused the soft-404 on main). The admin path is deliberately
// NOT listed — listing it only advertises it; it is noindex + auth instead.
// Google and Bing accept an RSS feed as a second sitemap (newest posts first).
export const robotsTxt = () =>
  text(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\nSitemap: ${SITE_URL}/feed.xml\n`);

/** Every indexable URL right now: the sitemap, IndexNow and llms.txt share it. null = Sheets down. */
export async function liveUrls(env, ctx) {
  const rows = await getRows('blog', env, ctx);
  if (rows == null) return null;
  return [
    ...Object.keys(ROUTES).map(p => SITE_URL + p),
    ...rows.map(p => `${SITE_URL}/blog/${p.Slug}`),
  ];
}

const PRIORITY = { '/': '1.0', '/blog': '0.9', '/projects': '0.8', '/skills': '0.7', '/experience': '0.7', '/about': '0.6', '/contact': '0.5' };

export async function sitemapXml(env, ctx) {
  const rows = await getRows('blog', env, ctx);
  const posts = (rows || []).map(p => ({
    loc: `/blog/${p.Slug}`, priority: '0.8', lastmod: isoDate(p.Last_Modified) || isoDate(p.Date),
  }));
  const newest = posts.map(p => p.lastmod).filter(Boolean).sort().pop() || null;
  const urls = [
    ...Object.keys(ROUTES).map(loc => ({ loc, priority: PRIORITY[loc] || '0.5', lastmod: loc === '/blog' ? newest : null })),
    ...posts,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url>\n    <loc>${esc(SITE_URL + u.loc)}</loc>\n` +
      (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : '') +
      `    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
    `\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml;charset=UTF-8',
      'Cache-Control': rows ? 'public, max-age=3600' : 'public, max-age=60', // retry soon if Sheets failed
    },
  });
}

// ── RSS 2.0 — feed readers, Bing/Google (as a sitemap), aggregators ────────
const rfc822 = iso => (iso ? new Date(`${iso}T00:00:00Z`).toUTCString() : null);

export async function feedXml(env, ctx) {
  const [rows, site] = await Promise.all([getRows('blog', env, ctx), loadSite(env, ctx)]);
  if (rows == null) return unavailable();
  const newest = rows.map(p => isoDate(p.Last_Modified) || isoDate(p.Date)).filter(Boolean).sort().pop();
  const items = rows.slice(0, 50).map(p => {
    const url = `${SITE_URL}/blog/${p.Slug}`;
    const pub = rfc822(isoDate(p.Date));
    return `    <item>\n      <title>${esc(p.Title)}</title>\n      <link>${esc(url)}</link>\n` +
      `      <guid isPermaLink="true">${esc(url)}</guid>\n` +
      (pub ? `      <pubDate>${pub}</pubDate>\n` : '') +
      `      <description>${esc(p.Excerpt || plainExcerpt(p.Content))}</description>\n` +
      [p.Category, ...splitList(p.Tags)].filter(Boolean).map(c => `      <category>${esc(c)}</category>\n`).join('') +
      `    </item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n` +
    `    <title>${esc(SITE_NAME)} — Blog</title>\n    <link>${SITE_URL}/blog</link>\n` +
    `    <description>${esc(routeMeta('/blog', site).description)}</description>\n    <language>en</language>\n` +
    (newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>\n` : '') +
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />\n` +
    items.join('\n') + (items.length ? '\n' : '') + `  </channel>\n</rss>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml;charset=UTF-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

// ── AI agents / answer engines ─────────────────────────────────────────────
// Markdown copies are noindex (the HTML page is the one to rank) and point
// to it with a canonical Link header.
const markdown = (body, canonical) => new Response(body, {
  headers: {
    'Content-Type': 'text/markdown;charset=UTF-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    'X-Robots-Tag': 'noindex',
    ...(canonical ? { Link: `<${canonical}>; rel="canonical"` } : {}),
  },
});

async function postsWithExtras(env, ctx) {
  const [blog, faq, images] = await Promise.all([
    getRows('blog', env, ctx), getRows('faq', env, ctx), getRows('images', env, ctx),
  ]);
  return { blog, faqRows: faq || [], imageRows: images || [] };
}

const postMd = async (post, extras) =>
  postMarkdown(post, { ...extras, tableHTML: await sanitizeHTML(post.Table_HTML) });

/** /blog/<slug>.md — one published post as clean markdown. Drafts → 404. */
export async function postMarkdownFile(slug, env, ctx) {
  const { blog, ...extras } = await postsWithExtras(env, ctx);
  if (blog == null) return unavailable();
  const post = blog.find(p => p.Slug === slug);
  if (!post) return notFound();
  return markdown(await postMd(post, extras), `${SITE_URL}/blog/${post.Slug}`);
}

function intro(site) {
  return `# ${SITE_NAME} — ${plain(sv(site, 'hero_title'))}\n\n` +
    `> ${plain(sv(site, 'hero_subtitle'))}\n\n` +
    [
      sv(site, 'about_location') && `- Location: ${plain(sv(site, 'about_location'))}`,
      sv(site, 'edu_degree') && `- Education: ${plain(sv(site, 'edu_degree'))}, ${plain(sv(site, 'edu_details'))}`,
      sv(site, 'about_availability') && `- Availability: ${plain(sv(site, 'about_availability'))}`,
    ].filter(Boolean).join('\n');
}

function contact(site) {
  return [
    sv(site, 'contact_email') && `- Email: ${plain(sv(site, 'contact_email'))}`,
    sv(site, 'contact_linkedin') && `- LinkedIn: ${plain(sv(site, 'contact_linkedin'))}`,
    sv(site, 'contact_github') && `- GitHub: ${plain(sv(site, 'contact_github'))}`,
    `- Contact page: ${SITE_URL}/contact`,
  ].filter(Boolean).join('\n');
}

// https://llmstxt.org — index of the site; posts link to their .md copies
export async function llmsTxt(env, ctx) {
  const [rows, site] = await Promise.all([getRows('blog', env, ctx), loadSite(env, ctx)]);
  const posts = (rows || []).slice(0, 50).map(p =>
    `- [${p.Title}](${SITE_URL}/blog/${p.Slug}.md)${p.Excerpt ? `: ${p.Excerpt}` : ''}`);
  const pages = Object.keys(ROUTES).map(p => {
    const m = routeMeta(p, site);
    return `- [${p === '/' ? 'Home' : m.heading}](${SITE_URL}${p}): ${m.description}`;
  });
  return text(
`${intro(site)}

## Pages

${pages.join('\n')}

## Blog posts

${posts.join('\n') || '- (none published yet)'}

## Contact

${contact(site)}

## Optional

- [All posts in one file](${SITE_URL}/llms-full.txt): every published post as markdown
- [RSS feed](${SITE_URL}/feed.xml)
`, rows ? 3600 : 60, { 'X-Robots-Tag': 'noindex' });
}

/** /llms-full.txt — every published post in full, newest first. */
export async function llmsFullTxt(env, ctx) {
  const [{ blog, ...extras }, site] = await Promise.all([postsWithExtras(env, ctx), loadSite(env, ctx)]);
  if (blog == null) return unavailable();
  const posts = await Promise.all(blog.slice(0, 50).map(p => postMd(p, extras)));
  return text(
    `${intro(site)}\n\n## Contact\n\n${contact(site)}\n\n` +
    (posts.length ? posts.map(p => p.replace(/^# /, '## ').replace(/\n(#{2,5}) /g, '\n#$1 ')).join('\n---\n\n')
      : '(No posts published yet.)\n'),
    3600, { 'X-Robots-Tag': 'noindex' });
}
