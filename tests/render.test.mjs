// node --test tests/   (Node's built-in runner — no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../public/js/shared/render.js';

test('esc escapes all five HTML-significant characters', () => {
  assert.equal(R.esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(R.esc(null), '');
});

test('safeUrl allows only safe schemes', () => {
  for (const ok of ['https://a.b', 'http://a.b', 'mailto:x@y.z', 'tel:+977', '/blog', '#top'])
    assert.equal(R.safeUrl(ok), ok);
  for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', ''])
    assert.equal(R.safeUrl(bad), '');
});

test('jsonLd cannot break out of a script element', () => {
  const s = R.jsonLd({ t: '</script><script>alert(1)</script>& ' });
  assert.ok(!s.includes('<') && !s.includes('>') && !s.includes('&'));
  assert.deepEqual(JSON.parse(s), { t: '</script><script>alert(1)</script>& ' });
});

test('fixImgUrl converts Drive links and rejects non-http', () => {
  assert.equal(R.fixImgUrl('https://drive.google.com/file/d/abc123/view'), 'https://lh3.googleusercontent.com/d/abc123');
  assert.equal(R.fixImgUrl('javascript:alert(1)'), '');
  assert.equal(R.fixImgUrl('data:image/png;base64,xx'), '');
});

test('cleanBlogRows drops drafts, blanks, bad and duplicate slugs; sorts newest first', () => {
  const rows = R.cleanBlogRows([
    { Slug: 'old', Title: 'Old', Date: '2024-01-01' },
    { Slug: 'new', Title: 'New', Date: '2026-01-01' },
    { Slug: 'd', Title: 'Draft', Status: 'Draft' },
    { Slug: 'h', Title: 'Hidden', Published: 'no' },
    { Slug: '', Title: 'No slug' },
    { Slug: 'no-title', Title: '' },
    { Slug: 'bad slug"', Title: 'Bad' },
    { Slug: 'new', Title: 'Dup' },
  ]);
  assert.deepEqual(rows.map(r => r.Slug), ['new', 'old']);
});

test('md escapes raw HTML and only links http(s)', () => {
  const html = R.md('<script>alert(1)</script>\n[x](javascript:alert(1)) [ok](https://e.com/a"b)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!/href="javascript:/i.test(html));
  assert.ok(html.includes('href="https://e.com/a&quot;b"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('md renders headings, lists, code and image placeholders', () => {
  const html = R.md('## H\n- a\n- b\n```\n<b>\n```\n[img1]', { '[img1]': '<figure>IMG</figure>' });
  assert.match(html, /<h2>H<\/h2><ul><li>a<\/li><li>b<\/li><\/ul><pre><code>&lt;b&gt;\n<\/code><\/pre><figure>IMG<\/figure>/);
});

test('cards are real links with escaped content', () => {
  const post = { Slug: 'p', Title: '"T" <b>', Date: '2026-04-17', Image_URL: 'javascript:x' };
  const card = R.blogCardHTML(post, { reveal: false });
  assert.match(card, /^<a class="blog-card" href="\/blog\/p" data-link>/);
  assert.ok(card.includes('&quot;T&quot; &lt;b&gt;'));
  assert.ok(!card.includes('<img'), 'unsafe image URL dropped');
  assert.match(R.featuredCardHTML(post), /^<a class="fp-card reveal" href="\/blog\/p"/);
});

test('pagination uses crawlable links', () => {
  assert.equal(R.paginationHTML(1, 1), '');
  const p2 = R.paginationHTML(2, 3);
  assert.ok(p2.includes('href="/blog" data-link rel="prev"'));
  assert.ok(p2.includes('href="/blog?page=3" data-link rel="next"'));
});

test('articleHTML has exactly one h1 and the FAQ', () => {
  const html = R.articleHTML({ Slug: 's', Title: 'Title', Content: '## Sub' },
    { faqRows: [{ Blog_Slug: 's', FAQ_Number: '1', FAQ_Question: 'Q?', FAQ_Answer: 'A.' }] });
  assert.equal(html.match(/<h1\b/g).length, 1);
  assert.ok(html.includes('<summary class="faq-question">Q?</summary>'));
});

test('projectsHTML only links http(s) project URLs', () => {
  const html = R.projectsHTML([{ title: 'A', link: 'javascript:alert(1)' }, { title: 'B', link: 'https://ok.dev' }]);
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="https://ok.dev"'));
});

test('blogPostingLD uses Last_Modified for dateModified', () => {
  const ld = R.blogPostingLD({ Slug: 's', Title: 'T', Date: '2026-04-17', Last_Modified: '2026-05-02' });
  assert.equal(ld.datePublished, '2026-04-17');
  assert.equal(ld.dateModified, '2026-05-02');
  assert.equal(ld.url, 'https://suman-dangal.com.np/blog/s');
});

test('featuredPosts keeps sheet order and drops unknown slugs', () => {
  const blog = [{ Slug: 'a' }, { Slug: 'b' }];
  assert.deepEqual(R.featuredPosts([{ Slug: 'b' }, { Slug: 'x' }, { Slug: 'a' }], blog).map(p => p.Slug), ['b', 'a']);
});

test('isoDate keeps the calendar day in any time zone', () => {
  assert.equal(R.isoDate('April 18, 2026'), '2026-04-18');
  assert.equal(R.isoDate('2026-04-18'), '2026-04-18');
  assert.equal(R.isoDate('2026-04-18T23:30:00Z'), '2026-04-18');
  assert.equal(R.isoDate('September 1, 2026'), '2026-09-01');
  assert.equal(R.isoDate('not a date'), null);
  assert.equal(R.isoDate(''), null);
});

test('Sheet format: one leading | per line is the separator', () => {
  const cell = '## T\n|text with a | pipe\n|- item';
  assert.deepEqual(R.sheetToLines(cell), ['## T', 'text with a | pipe', '- item']);
  assert.equal(R.linesToSheet(R.sheetToLines(cell)), cell);
  assert.deepEqual(R.sheetToLines('a|b'), ['a', 'b'], 'legacy single-line cells');
  assert.deepEqual(R.sheetToLines('x\r\n|y'), ['x', 'y'], 'Windows line endings');
});

test('md renders ~~strikethrough~~ and keeps * literal inside `code`', () => {
  assert.equal(R.md('~~old~~ new'), '<p><del>old</del> new</p>');
  assert.equal(R.md('`a*b*c`'), '<p><code>a&#42;b&#42;c</code></p>');
});

test('displayDate shows every Sheet date format the same way', () => {
  assert.equal(R.displayDate('2026-10-08'), 'October 8, 2026');
  assert.equal(R.displayDate('April 18, 2026'), 'April 18, 2026');
  assert.equal(R.displayDate(''), '');
  assert.equal(R.displayDate('soon'), 'soon');
  assert.match(R.blogCardHTML({ Slug: 's', Title: 'T', Date: '2026-10-08' }), /datetime="2026-10-08">October 8, 2026</);
});

test('Site tab: known keys only, values trimmed, newlines kept', () => {
  const m = R.siteMap([{ Key: 'hero_badge', Value: ' Hi ' }, { Key: 'nope', Value: 'x' }, { Key: 'hero_title', Value: 'A\r\nB' }]);
  assert.deepEqual(m, { hero_badge: 'Hi', hero_title: 'A\nB' });
});

test('Site values: escaped, *accent*, new line → <br>; links validated', () => {
  assert.equal(R.siteValueHTML('Dev & QA\n*Engineer*'), 'Dev &amp; QA<br><em>Engineer</em>');
  assert.equal(R.siteValueHTML('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(R.siteHref('+977 9800000000', 'tel'), 'tel:+9779800000000');
  assert.equal(R.siteHref('me@example.com', 'email'), 'mailto:me@example.com');
  assert.equal(R.siteHref('javascript:alert(1)', 'url'), '');
  assert.equal(R.siteHref('/projects', 'path'), '/projects');
  assert.equal(R.siteHref('//evil.com', 'path'), '');
});

test('routeMeta applies Site title/description/heading overrides', () => {
  const m = R.routeMeta('/skills', { meta_title_skills: 'T', meta_desc_skills: 'D', skills_heading: 'H' });
  assert.deepEqual([m.title, m.description, m.heading], ['T', 'D', 'H']);
  assert.equal(R.routeMeta('/skills', {}).title, 'Skills & Stack | Suman Dangal');
});

test('Projects read your columns: highlights, span2, num, TRUE checkboxes', () => {
  const html = R.projectsHTML([{ num: '7', title: 'P', highlights: 'a | b', featured: 'TRUE', span2: 'true' }]);
  assert.match(html, /proj-card reveal feat wide/);
  assert.match(html, /<div class="proj-num">07 \/ Featured<\/div>/);
  assert.match(html, /<li>a<\/li><li>b<\/li>/);
});

test('Skills colour accepts blue and c-blue', () => {
  assert.match(R.skillsHTML([{ title: 'x', color: 'blue' }]), /skill-card c-blue/);
  assert.match(R.skillsHTML([{ title: 'x', color: 'c-amber' }]), /skill-card c-amber/);
  assert.match(R.skillsHTML([{ title: 'x', color: 'pink' }]), /skill-card c-green/);
});

test('cleanListRows hides drafts and empty rows, sorts by Order', () => {
  const rows = R.cleanListRows([
    { title: 'b', Order: '2' }, { title: 'hidden', Status: 'draft' }, { title: '' },
    { title: 'a', Order: '1' }, { title: 'no order' },
  ], 'title');
  assert.deepEqual(rows.map(r => r.title), ['a', 'b', 'no order']);
});

// ── Internal links, freshness, titles, agent markdown ─────────────────────
const POSTS = R.cleanBlogRows([
  { Slug: 'c', Title: 'Cloudflare Hosting', Category: 'Guides', Tags: 'cloudflare, nepal', Date: 'April 18, 2026' },
  { Slug: 'd', Title: 'Free Domain', Category: 'Guides', Tags: 'domain, nepal', Date: 'April 20, 2026', Last_Modified: 'September 1, 2026',
    Excerpt: 'How to <get> it', Content: '## Who?\n|You can **apply** if:\n|- A student\n|[img1]' },
  { Slug: 'g', Title: 'Sheets as DB', Category: 'Dev', Tags: 'sheets', Date: 'July 30, 2026' },
  { Slug: 'h', Title: 'Hosting tips', Category: 'Guides', Tags: 'nepal', Date: 'May 1, 2026' },
  { Slug: 'z', Title: 'Old', Category: 'Dev', Date: 'January 1, 2026' },
]);
const D = POSTS.find(p => p.Slug === 'd');

test('older/newer neighbours follow date order; related posts skip them', () => {
  const n = R.postNeighbours(D, POSTS);
  assert.deepEqual([n.newer.Slug, n.older.Slug], ['h', 'c']);
  assert.deepEqual(R.relatedPosts(D, POSTS).map(p => p.Slug), ['g', 'z'], 'same category first, then newest');
  assert.deepEqual(R.relatedPosts({ Slug: 'x' }, []), []);
  assert.equal(R.postNavHTML(D, [D]), '', 'no nav when the post is alone');
});

test('articleHTML links to other posts, shows Updated date, keeps one h1', () => {
  const html = R.articleHTML(D, { allPosts: POSTS });
  assert.match(html, /Updated <time datetime="2026-09-01">September 1, 2026<\/time>/);
  assert.match(html, /rel="prev"[^>]*>|href="\/blog\/c" data-link rel="prev"/);
  assert.match(html, /href="\/blog\/h" data-link rel="next"/);
  assert.match(html, /<section class="related-posts"[^>]*><h2>Related posts<\/h2>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(!R.articleHTML({ ...D, Last_Modified: D.Date }).includes('article-updated'), 'no Updated when unchanged');
});

test('pageTitle adds the site name only when it fits in 60 characters', () => {
  assert.equal(R.pageTitle('Short'), 'Short | Suman Dangal');
  const long = 'How I Turned a Google Sheet Into My Website Database For Free';
  assert.equal(R.pageTitle(long), long);
});

test('BlogPosting has wordCount and articleSection', () => {
  const ld = R.blogPostingLD(D);
  assert.equal(ld.articleSection, 'Guides');
  assert.equal(ld.wordCount, 7);
  assert.equal(ld.dateModified, '2026-09-01');
});

test('postMarkdown: metadata, resolved images, FAQ, canonical', () => {
  const md = R.postMarkdown(D, {
    imageRows: [{ Blog_Slug: 'd', Img_Number: '1', Img_URL: 'https://lh3.googleusercontent.com/d/x', Img_Alt: 'Form [1]' }],
    faqRows: [{ Blog_Slug: 'd', FAQ_Number: '1', FAQ_Question: 'Free?', FAQ_Answer: 'Yes.' }],
  });
  assert.ok(md.startsWith('# Free Domain\n\n> How to <get> it\n'));
  assert.match(md, /- Published: 2026-04-20\n- Updated: 2026-09-01\n/);
  assert.match(md, /- Canonical URL: https:\/\/suman-dangal\.com\.np\/blog\/d\n/);
  assert.match(md, /\n## Who\?\nYou can \*\*apply\*\* if:\n- A student\n!\[Form 1\]\(https:\/\/lh3\.googleusercontent\.com\/d\/x\)\n/);
  assert.match(md, /## Frequently Asked Questions\n\n### Free\?\n\nYes\.\n$/);
  assert.ok(!R.postMarkdown(D).includes('[img1]'), 'unknown image placeholders are dropped');
});
