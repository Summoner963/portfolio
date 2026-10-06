// worker/seo-files.js — /sitemap.xml, /robots.txt, /llms.txt

import { SITE_URL, ROUTES, esc, isoDate } from '../public/js/shared/render.js';
import { getRows } from './sheets.js';

const text = (body, maxAge = 3600) => new Response(body, {
  headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': `public, max-age=${maxAge}` },
});

// /api/ stays crawlable: Googlebot renders the SPA, which loads data from it
// (blocking it caused the soft-404 on main). The admin path is deliberately
// NOT listed — listing it only advertises it; it is noindex + auth instead.
export const robotsTxt = () => text(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

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

// Generated from ROUTES + published posts so it can't drift from the site.
export async function llmsTxt(env, ctx) {
  const rows = (await getRows('blog', env, ctx)) || [];
  const pages = Object.entries(ROUTES).map(([p, m]) => `- [${p === '/' ? 'Home' : m.heading}](${SITE_URL}${p}): ${m.description}`);
  const posts = rows.slice(0, 50).map(p => `- [${p.Title}](${SITE_URL}/blog/${p.Slug})${p.Excerpt ? `: ${p.Excerpt}` : ''}`);
  return text(
`# Suman Dangal — Dev & QA Engineer

> Final-year BCA student at Tribhuvan University (Bhaktapur, Nepal) building and
> testing full-stack web and mobile applications. Open to Dev and QA internships.

## Pages

${pages.join('\n')}

## Blog posts

${posts.join('\n') || '- (none published yet)'}

## Contact

- Email: sumandangal888@gmail.com
- LinkedIn: https://linkedin.com/in/sumandangal963
- Contact page: ${SITE_URL}/contact
`, rows.length ? 3600 : 60);
}
