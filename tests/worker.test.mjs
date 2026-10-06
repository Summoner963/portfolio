// Worker module tests — node --test (no dependencies). HTMLRewriter/caches
// aren't available in Node, so only pure modules are imported here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccessJwt, teamOrigin, isSameOriginJson } from '../worker/access.js';
import { cleanCell, validateRow } from '../worker/cms-proxy.js';
import { hostPolicy, canonicalPath, isRateLimited } from '../worker/http.js';

// ── Access JWT ────────────────────────────────────────────────────────────
const DOMAIN = 'https://team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const b64url = buf => Buffer.from(buf).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const otherPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);

async function sign(claims, { header = { alg: 'RS256', kid: 'k1' }, key = privateKey } = {}) {
  const h = b64url(JSON.stringify(header)), p = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { iss: DOMAIN, aud: [AUD], exp: now + 600, nbf: now - 10, email: 'me@example.com' };
const opts = { domain: DOMAIN, aud: AUD, keys: [jwk] };

test('valid Access JWT is accepted', async () => {
  assert.equal((await verifyAccessJwt(await sign(good), opts))?.email, 'me@example.com');
});
test('Access JWT rejected: wrong aud / iss / expired / not yet valid', async () => {
  assert.equal(await verifyAccessJwt(await sign({ ...good, aud: ['other'] }), opts), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' }), opts), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, exp: now - 3600 }), opts), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, nbf: now + 3600 }), opts), null);
});
test('Access JWT rejected: forged signature, alg tampering, unknown kid, garbage', async () => {
  assert.equal(await verifyAccessJwt(await sign(good, { key: otherPair.privateKey }), opts), null);
  assert.equal(await verifyAccessJwt(await sign(good, { header: { alg: 'none', kid: 'k1' } }), opts), null);
  assert.equal(await verifyAccessJwt(await sign(good, { header: { alg: 'HS256', kid: 'k1' } }), opts), null);
  assert.equal(await verifyAccessJwt(await sign(good, { header: { alg: 'RS256', kid: 'nope' } }), opts), null);
  const t = (await sign(good)).split('.');
  assert.equal(await verifyAccessJwt(`${t[0]}.${b64url(JSON.stringify({ ...good, email: 'x@y' }))}.${t[2]}`, opts), null);
  for (const bad of ['', 'a.b', 'a.b.c', null]) assert.equal(await verifyAccessJwt(bad, opts), null);
});
test('ACCESS_AUD may list several apps (custom domain + previews)', async () => {
  assert.ok(await verifyAccessJwt(await sign(good), { ...opts, aud: 'preview-aud, aud-tag-123' }));
  assert.equal(await verifyAccessJwt(await sign(good), { ...opts, aud: 'preview-aud,other' }), null);
});
test('missing Access config fails closed', async () => {
  assert.equal(await verifyAccessJwt(await sign(good), { ...opts, aud: '' }), null);
  assert.equal(await verifyAccessJwt(await sign(good), { ...opts, domain: '' }), null);
});
test('teamOrigin normalises and rejects non-Access hosts', () => {
  assert.equal(teamOrigin('team'), DOMAIN);
  assert.equal(teamOrigin('team.cloudflareaccess.com/'), DOMAIN);
  assert.equal(teamOrigin('https://team.cloudflareaccess.com'), DOMAIN);
  assert.equal(teamOrigin('https://evil.com'), '');
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
