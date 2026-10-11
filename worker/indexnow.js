// worker/indexnow.js — IndexNow: tells Bing, Yandex, Naver, Seznam, Yep and the
// other participating engines that pages changed, so they recrawl in minutes.
// Google does not use IndexNow; it reads the sitemap and Search Console.
// Protocol (checked 2026-10-11): https://www.indexnow.org/documentation
//
// The key is public by design — engines fetch https://<host>/<key>.txt and
// compare it — so it lives in wrangler.toml [vars], not in secrets.

import { SITE_URL } from '../public/js/shared/render.js';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'; // shared with every engine
export const INDEXNOW_MAX = 100;          // protocol allows 10,000; this site has far fewer pages
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;   // 8–128 characters: letters, digits, dashes
const COOLDOWN_MS = 10 * 60_000;          // "avoid submitting the same URL many times a day"
const _sent = new Map();                  // url → last accepted submit (per isolate, best effort)

export function indexNowKey(env) {
  const k = String(env.INDEXNOW_KEY || '').trim();
  return KEY_RE.test(k) ? k : null;
}

/** GET /<key>.txt — the verification file. null when the path isn't it. */
export function keyFileResponse(path, env) {
  const key = indexNowKey(env);
  if (!key || path !== `/${key}.txt`) return null;
  return new Response(key, {
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Cache-Control': 'public, max-age=86400', 'X-Robots-Tag': 'noindex' },
  });
}

/**
 * Split requested URLs into those to send now, those not live on the site
 * (drafts, typos, other sites, or a post the published Sheet doesn't show
 * yet) and those already sent in the last 10 minutes.
 */
export function pickUrls(requested, live, now = Date.now()) {
  const liveSet = new Set(live);
  const out = { send: [], notLive: [], recent: [] };
  for (const u of new Set(requested)) {
    if (!liveSet.has(u)) out.notLive.push(u);
    else if (now - (_sent.get(u) || 0) < COOLDOWN_MS) out.recent.push(u);
    else out.send.push(u);
  }
  return out;
}

const MESSAGES = {
  200: 'Sent — Bing and the other IndexNow search engines were notified',
  202: 'Received — IndexNow is still checking the key file; the pages will be processed',
  400: 'IndexNow rejected the request format',
  403: 'IndexNow could not verify the key — the key file must be live on the production domain (after the merge)',
  422: 'IndexNow says these URLs do not match the site or key',
  429: 'Too many submissions — IndexNow asks to wait before sending again',
};

/** POST the list to IndexNow → { ok, status, message }. */
export async function submitIndexNow(key, urls) {
  let res;
  try {
    res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: urls }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: 0, message: 'IndexNow did not answer — try again later' };
  }
  const ok = res.status === 200 || res.status === 202;
  if (ok) { const now = Date.now(); urls.forEach(u => _sent.set(u, now)); }
  return { ok, status: res.status, message: MESSAGES[res.status] || `IndexNow answered HTTP ${res.status}` };
}

/**
 * POST /api/cms/indexnow  body: { urls: [absolute URLs] } or { all: true }
 * (session + CSRF are checked by the caller). `live` = liveUrls() or null.
 * @returns {[object, number]} JSON body and HTTP status
 */
export async function handleIndexNow(request, env, live) {
  const key = indexNowKey(env);
  if (!key) return [{ ok: false, error: 'IndexNow is not set up (INDEXNOW_KEY in wrangler.toml)' }, 501];
  const raw = await request.text();
  let body = null;
  if (raw.length <= 20_000) { try { body = JSON.parse(raw); } catch {} }
  if (!body || typeof body !== 'object') return [{ ok: false, error: 'Bad request' }, 400];
  if (live == null) return [{ ok: false, error: "Couldn't read the site's pages — try again in a minute" }, 503];

  const requested = body.all === true ? live
    : Array.isArray(body.urls) ? body.urls.filter(u => typeof u === 'string').map(u => u.trim()) : [];
  if (!requested.length) return [{ ok: false, error: 'No URLs given' }, 400];
  if (requested.length > INDEXNOW_MAX) return [{ ok: false, error: `At most ${INDEXNOW_MAX} URLs at a time` }, 400];

  const { send, notLive, recent } = pickUrls(requested, live);
  if (!send.length) {
    return [{
      ok: false, notLive, recent,
      error: notLive.length
        ? 'Not live on the site yet — a new post can take a few minutes to appear. Try again shortly.'
        : 'Already sent in the last 10 minutes',
    }, 409];
  }
  const r = await submitIndexNow(key, send);
  return [{ ok: r.ok, status: r.status, message: r.message, ...(r.ok ? {} : { error: r.message }),
            sent: send, notLive, recent }, r.ok ? 200 : 502];
}
