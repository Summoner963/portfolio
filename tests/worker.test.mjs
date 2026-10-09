// Worker module tests — node --test (no dependencies). HTMLRewriter/caches
// aren't available in Node, so only pure modules are imported here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, parseHash, checkCredentials, issueSession, getSession,
  isSameOriginJson, csrfOk, safeEqual, COOKIE,
} from '../worker/auth.js';
import { cleanCell, validateRow } from '../worker/cms-proxy.js';
import { hostPolicy, canonicalPath, isRateLimited } from '../worker/http.js';

// ── Password hashing ──────────────────────────────────────────────────────
const PW = 'Correct-Horse-Battery-Staple-42';
const env = {
  CMS_USERNAME: 'suman',
  CMS_PASSWORD_HASH: await hashPassword(PW),
  CMS_SESSION_SECRET: 'x'.repeat(43),
};

test('hashPassword produces a salted PBKDF2 string that parses', async () => {
  assert.match(env.CMS_PASSWORD_HASH, /^pbkdf2-sha256\$20000\$[\w-]{22}\$[\w-]{43}$/);
  assert.notEqual(await hashPassword(PW), env.CMS_PASSWORD_HASH, 'random salt');
  assert.ok(parseHash(env.CMS_PASSWORD_HASH));
});
test('old unsalted SHA-256 hashes and junk are refused (login disabled)', async () => {
  const old = 'a'.repeat(64);
  assert.equal(parseHash(old), null);
  assert.equal(await checkCredentials('suman', PW, { ...env, CMS_PASSWORD_HASH: old }), false);
  assert.equal(parseHash('pbkdf2-sha256$500$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(43)), null, 'too few iterations');
  assert.equal(parseHash('pbkdf2-sha256$900000$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(43)), null, 'over Workers limit');
});
test('checkCredentials needs both the right user and password', async () => {
  assert.equal(await checkCredentials('suman', PW, env), true);
  assert.equal(await checkCredentials('suman', PW + 'x', env), false);
  assert.equal(await checkCredentials('admin', PW, env), false);
  assert.equal(await checkCredentials('', '', env), false);
  assert.equal(await checkCredentials('suman', PW, { ...env, CMS_USERNAME: '' }), false);
});
test('safeEqual compares contents, not lengths only', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

// ── Sessions ──────────────────────────────────────────────────────────────
const withCookie = cookie => new Request('https://suman-dangal.com.np/api/cms/session', {
  headers: { Cookie: cookie.split(';')[0] },
});
test('session cookie is HttpOnly, Secure, SameSite=Strict, __Host- prefixed', async () => {
  const { cookie } = await issueSession(env, 'suman');
  assert.match(cookie, new RegExp(`^${COOKIE.replace('$', '\$')}=`));
  for (const attr of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=28800']) assert.ok(cookie.includes(attr), attr);
  assert.ok(!/Domain=/i.test(cookie));
});
test('valid session is accepted and yields a CSRF token', async () => {
  const s = await getSession(withCookie((await issueSession(env, 'suman')).cookie), env);
  assert.equal(s.user, 'suman');
  assert.match(s.csrf, /^[\w-]{43}$/);
});
test('tampered, expired, re-keyed or password-changed sessions are rejected', async () => {
  const { cookie } = await issueSession(env, 'suman');
  const [name, value] = cookie.split(';')[0].split('=');
  const [body, sig] = value.split('.');
  const forged = JSON.parse(Buffer.from(body, 'base64url')) ; forged.u = 'someone';
  assert.equal(await getSession(withCookie(`${name}=${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`), env), null);
  assert.equal(await getSession(withCookie(`${name}=${body}.${sig.slice(0, -2)}AA`), env), null);
  const old = await issueSession(env, 'suman', { login: Math.floor(Date.now() / 1000) - 9 * 3600 });
  assert.equal(await getSession(withCookie(old.cookie), env), null, 'past 8 h');
  assert.equal(await getSession(withCookie(cookie), { ...env, CMS_SESSION_SECRET: 'y'.repeat(43) }), null);
  assert.equal(await getSession(withCookie(cookie), { ...env, CMS_PASSWORD_HASH: await hashPassword('new') }), null);
  assert.equal(await getSession(withCookie(cookie), { ...env, CMS_SESSION_SECRET: 'short' }), null);
  assert.equal(await getSession(withCookie('other=1'), env), null);
});
test('fresh sessions are kept; sessions older than an hour are rotated', async () => {
  const fresh = await issueSession(env, 'suman');
  assert.equal((await getSession(withCookie(fresh.cookie), env)).rotateCookie, undefined);

  const realNow = Date.now;
  const twoHoursAgo = realNow() - 2 * 3600 * 1000;
  Date.now = () => twoHoursAgo; // issue the session "two hours ago"
  const old = await issueSession(env, 'suman');
  Date.now = realNow;
  const s = await getSession(withCookie(old.cookie), env);
  assert.ok(s.rotateCookie, 'rotated');
  assert.match(s.rotateCookie, /Max-Age=(2[0-1]\d{3})/, 'keeps the original 8 h deadline (~6 h left)');
  const again = await getSession(withCookie(s.rotateCookie), env);
  assert.equal(again.csrf, s.csrf, 'returned CSRF token matches the rotated cookie');
});

// ── CSRF ──────────────────────────────────────────────────────────────────
const req = (h) => new Request('https://suman-dangal.com.np/api/cms/write', { method: 'POST', headers: h });
test('CMS calls must be same-origin JSON', () => {
  const ok = { Origin: 'https://suman-dangal.com.np', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' };
  assert.equal(isSameOriginJson(req(ok)), true);
  assert.equal(isSameOriginJson(req({ ...ok, Origin: 'https://evil.com' })), false);
  assert.equal(isSameOriginJson(req({ ...ok, 'Sec-Fetch-Site': 'cross-site' })), false);
  assert.equal(isSameOriginJson(req({ ...ok, 'Content-Type': 'text/plain' })), false);
  const { Origin, ...noOrigin } = ok;
  assert.equal(isSameOriginJson(req(noOrigin)), false);
});
test('CSRF token must match the session', () => {
  const session = { csrf: 'token-abc' };
  assert.equal(csrfOk(req({ 'X-CSRF-Token': 'token-abc' }), session), true);
  assert.equal(csrfOk(req({ 'X-CSRF-Token': 'token-abd' }), session), false);
  assert.equal(csrfOk(req({}), session), false);
  assert.equal(csrfOk(req({ 'X-CSRF-Token': 'token-abc' }), null), false);
});

// ── CMS validation ────────────────────────────────────────────────────────
test('cleanCell neutralises spreadsheet formulas and control chars', () => {
  assert.equal(cleanCell('=IMPORTXML("http://x")'), `'=IMPORTXML("http://x")`);
  for (const c of ['+1', '-1', '@SUM(A1)']) assert.equal(cleanCell(c), `'${c}`);
  assert.equal(cleanCell('a\u0000b\r\nc'), 'ab\nc');
  assert.equal(cleanCell('Plain text'), 'Plain text');
});
test('validateRow keeps only allow-listed fields and enforces rules', () => {
  const { row } = validateRow('blog', { Title: 'Hi', Slug: 'hi', Evil: 'x', Image_URL: 'https://a.b/c.png' });
  assert.deepEqual(row, { Title: 'Hi', Slug: 'hi', Image_URL: 'https://a.b/c.png' });
  assert.match(validateRow('blog', { Title: 'Hi', Slug: 'bad slug' }).error, /Slug/);
  assert.match(validateRow('blog', { Title: 'Hi', Slug: 'ok', Image_URL: 'javascript:alert(1)' }).error, /Image_URL/);
  assert.match(validateRow('blog', { Title: 'Hi', Slug: 'ok', Date: '2026-13-45' }).error, /Date/);
  assert.match(validateRow('blog', { Slug: 'ok' }).error, /Title/);
  assert.match(validateRow('faq', { Blog_Slug: 'ok', FAQ_Number: '0', FAQ_Question: 'q', FAQ_Answer: 'a' }).error, /FAQ_Number/);
  assert.match(validateRow('blog', { Title: 'x'.repeat(201), Slug: 'ok' }).error, /Title/);
  assert.equal(validateRow('blog', ['array']).error, 'Invalid row');
});

// ── Redirects / host policy ───────────────────────────────────────────────
const U = s => new URL(s);
test('pages.dev production redirects; previews are noindex; www → apex', () => {
  assert.equal(hostPolicy(U('https://portfolio-1e6.pages.dev/blog?x=1')).redirectTo, 'https://suman-dangal.com.np/blog?x=1');
  assert.deepEqual(hostPolicy(U('https://abc.portfolio-1e6.pages.dev/blog')), { noindex: true });
  assert.equal(hostPolicy(U('https://www.suman-dangal.com.np/a')).redirectTo, 'https://suman-dangal.com.np/a');
  assert.deepEqual(hostPolicy(U('https://suman-dangal.com.np/')), { noindex: false });
});
test('canonicalPath normalises page URLs and never yields //host', () => {
  const c = s => canonicalPath(U('https://x.dev' + s));
  assert.equal(c('/skills/'), '/skills');
  assert.equal(c('/index.html'), '/');
  assert.equal(c('/blog/?page=2'), '/blog?page=2');
  assert.equal(c('//evil.com/'), '/evil.com');
  assert.equal(c('/blog/free-domain-in-nepal'), '/blog/get-free-domain-in-nepal');
  assert.equal(c('/skills'), null);
  assert.equal(c('/api/data/'), null);
});
test('rate limiter blocks after the limit', () => {
  const b = new Map();
  for (let i = 0; i < 3; i++) assert.equal(isRateLimited('ip', 3, 60_000, b), false);
  assert.equal(isRateLimited('ip', 3, 60_000, b), true);
});

test('CMS validation for the new tabs uses your column names', () => {
  assert.ok(validateRow('site', { Key: 'hero_badge', Value: 'x' }).row);
  assert.match(validateRow('site', { Key: 'not_a_key', Value: 'x' }).error, /Key/);
  assert.ok(validateRow('projects', { title: 'P', highlights: 'a | b', featured: 'true', span2: 'false', link: '' }).row);
  assert.match(validateRow('projects', { title: 'P', link: 'javascript:x' }).error, /link/);
  assert.match(validateRow('projects', { desc: 'no title' }).error, /title/);
  assert.ok(validateRow('skills', { title: 'S', color: 'blue' }).row);
  assert.match(validateRow('skills', { title: 'S', color: 'pink' }).error, /color/);
  assert.ok(validateRow('exp', { role: 'Intern', bullets: 'a | b' }).row);
  assert.ok(validateRow('about', { bio1: 'Hello' }).row);
  assert.equal(validateRow('site', { Key: 'contact_phone', Value: '+977 98' }).row.Value, "'+977 98", 'formula guard');
});

test('CMS write payloads: key column set by server, About always row 2', async () => {
  const { handleCMSWrite } = await import('../worker/cms-proxy.js');
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return new Response('{"ok":true}'); };
  const env = { CMS_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfy_test/exec', CMS_APPS_SCRIPT_SECRET: 's'.repeat(40) };
  const call = body => handleCMSWrite(new Request('https://x.dev/api/cms/write', { method: 'POST', body: JSON.stringify(body) }), env);
  try {
    let r = await call({ action: 'update', sheet: 'site', slug: 'hero_badge', slugField: 'Evil', row: { Key: 'hero_badge', Value: 'Hi' } });
    assert.equal(r.res.status, 200); assert.equal(r.sheet, 'site');
    assert.deepEqual([sent[0].slugField, sent[0].slug, sent[0].row.Value], ['Key', 'hero_badge', 'Hi']);
    r = await call({ action: 'update', sheet: 'about', slug: 'anything', row: { bio1: 'x' } });
    assert.equal(sent[1].slug, '2'); assert.equal(sent[1].slugField, undefined);
    r = await call({ action: 'delete', sheet: 'about', slug: '2' });
    assert.equal(r.res.status, 400, 'About rows cannot be deleted');
    r = await call({ action: 'delete', sheet: 'projects', slug: '../x' });
    assert.equal(r.res.status, 400, 'IDs must be numbers');
    r = await call({ action: 'delete', sheet: 'projects', slug: '3' });
    assert.deepEqual([sent.at(-1).slugField, sent.at(-1).slug], ['ID', '3']);
    r = await call({ action: 'append', sheet: 'Sheet1', row: {} });
    assert.equal(r.res.status, 400, 'unknown sheet');
  } finally { globalThis.fetch = realFetch; }
});
