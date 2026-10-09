// worker/pages.js
// Route → page description (status, metadata, JSON-LD, server-rendered body).
// All markup comes from public/js/shared/render.js, the same functions the
// browser views use, so the SPA can keep the server-rendered DOM as-is.

import * as R from '../public/js/shared/render.js';
import { getRows } from './sheets.js';
import { sanitizeHTML } from './sanitize.js';

const { SITE_URL, ROUTES } = R;
const home = { name: 'Home', url: `${SITE_URL}/` };
const crumbs = (...rest) => R.breadcrumbLD([home, ...rest]);
const base = { website: R.websiteLD() };

function routePage(path, site = {}) {
  const m = R.routeMeta(path, site);
  return {
    status: 200, view: m.view, title: m.title, description: m.description,
    canonical: SITE_URL + (path === '/' ? '/' : path), css: m.css, ssrRoute: path,
    heading: m.view === 'home' ? 'hero' : 'section',
    jsonLd: { 'ld-website': base.website,
              ...(path === '/' ? {} : { 'bc-schema': crumbs({ name: m.heading, url: SITE_URL + path }) }) },
    inject: {},
  };
}

export function notFoundPage(path, { status = 404, article = false } = {}) {
  return {
    status, view: 'home', heading: 'none', robots: 'noindex, nofollow',
    title: status === 404 ? 'Page Not Found | Suman Dangal' : 'Temporarily Unavailable | Suman Dangal',
    description: status === 404 ? 'This page does not exist.' : 'Please try again in a minute.',
    canonical: SITE_URL + path, css: [],
    jsonLd: {}, inject: {},
    notFound: status === 404 ? R.notFoundHTML(path, { article })
      : `<div class="not-found-wrap"><h1>Temporarily unavailable</h1><p>Please try again in a minute.</p></div>`,
  };
}

const unavailable = path => notFoundPage(path, { status: 503 });

export async function homePage(env, ctx, site) {
  const page = routePage('/', site);
  page.jsonLd['ld-profile'] = R.profilePageLD();
  const [blog, featured] = await Promise.all([getRows('blog', env, ctx), getRows('featured', env, ctx)]);
  const posts = R.featuredPosts(featured, blog);
  if (posts.length) {
    page.inject['#featuredGrid'] = posts.map(p => R.featuredCardHTML(p, { reveal: false })).join('');
    page.showFeatured = true;
  }
  return page;
}

/** skills / projects / experience / about: Sheet rows → section HTML. */
const SECTION = {
  '/skills':     { sheet: 'skills',   target: '#skillsGrid',   html: rows => R.skillsHTML(rows, { reveal: false }) },
  '/projects':   { sheet: 'projects', target: '#projectsGrid', html: rows => R.projectsHTML(rows, { reveal: false }) },
  '/experience': { sheet: 'exp',      target: '#expTimeline',  html: rows => R.timelineHTML(rows, { reveal: false }) },
  '/about':      { sheet: 'about',    target: '#aboutText',    html: rows => R.aboutHTML(R.aboutParas(rows)) },
};

export async function sectionPage(path, env, ctx, site) {
  const page = routePage(path, site);
  if (path === '/contact') {
    const pairs = R.faqPairs(await getRows('faq', env, ctx), 'contact');
    if (pairs.length) {
      page.inject['#contactFaq'] = R.faqSectionHTML(pairs);
      page.jsonLd['faq-schema'] = R.faqLD(pairs);
    }
  }
  const s = SECTION[path];
  if (s) {
    const rows = await getRows(s.sheet, env, ctx);
    const html = rows?.length ? s.html(rows) : '';
    if (html) page.inject[s.target] = html; // else the client renders its built-in fallback
  }
  return page;
}

export async function blogListPage(url, env, ctx, site) {
  const rows = await getRows('blog', env, ctx);
  if (rows == null) return unavailable(url.pathname);
  const total = Math.max(1, Math.ceil(rows.length / R.POSTS_PER_PAGE));
  const raw = url.searchParams.get('page');
  const n = raw == null ? 1 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > total) return notFoundPage(url.pathname + url.search);

  const page = routePage('/blog', site);
  page.ssrRoute = n > 1 ? `/blog?page=${n}` : '/blog';
  if (n > 1) {
    page.canonical = `${SITE_URL}/blog?page=${n}`;
    page.title = `Blog — Page ${n} | Suman Dangal`;
  }
  const slice = rows.slice((n - 1) * R.POSTS_PER_PAGE, n * R.POSTS_PER_PAGE);
  page.inject['#blogGrid'] = slice.length
    ? slice.map(p => R.blogCardHTML(p, { reveal: false })).join('')
    : '<p class="empty-state">No posts yet — check back soon.</p>';
  const pag = R.paginationHTML(n, total);
  if (pag) page.inject['#blogPagination'] = pag;
  page.jsonLd['ld-blog'] = R.blogLD(rows);
  return page;
}

export async function blogPostPage(slug, env, ctx) {
  const path = `/blog/${slug}`;
  const [blog, faq, images] = await Promise.all([
    getRows('blog', env, ctx), getRows('faq', env, ctx), getRows('images', env, ctx),
  ]);
  if (blog == null) return unavailable(path); // Sheets down: never claim 404
  const post = blog.find(p => p.Slug === slug);
  if (!post) return notFoundPage(path, { article: true });

  const canonical = SITE_URL + path;
  const image = R.fixImgUrl(post.Image_URL);
  const published = R.isoDate(post.Date);
  const modified = R.isoDate(post.Last_Modified) || published;
  const pairs = R.faqPairs(faq, slug);
  const tableHTML = await sanitizeHTML(post.Table_HTML);

  return {
    status: 200, view: 'article', heading: 'article', type: 'article',
    title: `${post.Title} | Suman Dangal`,
    description: post.Excerpt || R.plainExcerpt(post.Content) || ROUTES['/blog'].description,
    canonical, image: image || null, css: R.ARTICLE_CSS, ssrRoute: path,
    extraHead: [
      published && `<meta property="article:published_time" content="${published}" />`,
      modified && `<meta property="article:modified_time" content="${modified}" />`,
      `<meta property="article:author" content="Suman Dangal" />`,
      ...R.splitList(post.Tags).map(t => `<meta property="article:tag" content="${R.esc(t)}" />`),
    ].filter(Boolean).join(''),
    jsonLd: {
      'ld-website': base.website,
      'dyn-schema': R.blogPostingLD(post),
      'bc-schema': crumbs({ name: 'Blog', url: `${SITE_URL}/blog` }, { name: post.Title, url: canonical }),
      ...(pairs.length ? { 'faq-schema': R.faqLD(pairs) } : {}),
    },
    inject: { '#articleWrap': R.articleHTML(post, { imageRows: images || [], faqRows: faq || [], tableHTML }) },
  };
}

export function adminPage() {
  return {
    status: 200, view: 'cms', heading: 'none', robots: 'noindex, nofollow',
    title: 'Content Studio | Suman Dangal', description: 'Private content management.',
    canonical: `${SITE_URL}/back-lab`, css: [], jsonLd: {}, inject: {},
  };
}
