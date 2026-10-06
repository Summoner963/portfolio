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
