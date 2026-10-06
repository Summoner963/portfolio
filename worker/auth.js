// worker/auth.js
// ═══════════════════════════════════════════════════════════════════════════
//  CMS login + sessions (no third-party service, all WebCrypto).
//
//  Secrets (Cloudflare Pages → Settings → Variables and Secrets, type Secret;
//  create them with `node tools/make-cms-secrets.mjs`):
//    CMS_USERNAME        login name
//    CMS_PASSWORD_HASH   pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>
//    CMS_SESSION_SECRET  ≥32 random bytes (b64url) — signs session cookies
//  Anything missing or in the old SHA-256 format ⇒ login disabled (fails closed).
//
//  Password hashing: PBKDF2-SHA256, random 16-byte salt. Iterations are kept
//  modest (DEFAULT_ITERATIONS) because the Workers Free plan allows 10 ms CPU
//  per request (measured ≈4 ms at 20k); the generated password is random with
//  ~120 bits of entropy, so strength comes from the password, and online
//  guessing is throttled by the lockout below.
//
//  Session cookie: __Host-sd_session = b64url(JSON payload).b64url(HMAC)
//    HttpOnly; Secure; SameSite=Strict; Path=/ ; 8 h absolute lifetime,
//    re-issued (rotated) hourly; bound to the current password hash, so
//    changing the password logs every session out.
//  CSRF: per-session token (HMAC of the session id) required in X-CSRF-Token
//    on every state-changing call, plus same-origin + JSON checks.
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_ITERATIONS = 20_000;
export const MAX_ITERATIONS = 100_000;           // Workers' PBKDF2 ceiling
export const COOKIE = '__Host-sd_session';
const SESSION_TTL_S = 8 * 60 * 60;
const ROTATE_AFTER_S = 60 * 60;
const LOCK_MAX = 5;                               // failures per IP …
const LOCK_WINDOW_S = 15 * 60;                    // … within / locked for

const enc = new TextEncoder();
export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

/** Constant-time comparison of two byte arrays / strings. */
export function safeEqual(a, b) {
  a = typeof a === 'string' ? enc.encode(a) : new Uint8Array(a);
  b = typeof b === 'string' ? enc.encode(b) : new Uint8Array(b);
  if (crypto.subtle.timingSafeEqual && a.length === b.length) return crypto.subtle.timingSafeEqual(a, b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// ── Password hashing ──────────────────────────────────────────────────────

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, iterations))}`;
}

export function parseHash(stored) {
  const m = String(stored || '').trim().match(/^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]{16,})\$([A-Za-z0-9_-]{40,})$/);
  if (!m) return null;
  const iterations = Number(m[1]);
  if (iterations < 10_000 || iterations > MAX_ITERATIONS) return null;
  return { iterations, salt: unb64url(m[2]), hash: unb64url(m[3]) };
}

// A fixed dummy so a wrong username costs the same time as a wrong password
const DUMMY = { iterations: DEFAULT_ITERATIONS, salt: new Uint8Array(16), hash: new Uint8Array(32) };

/** True only if username and password both match. Always does one PBKDF2. */
export async function checkCredentials(username, password, env) {
  const parsed = parseHash(env.CMS_PASSWORD_HASH);
  const expectedUser = String(env.CMS_USERNAME || '');
  const ref = parsed || DUMMY;
  const got = await pbkdf2(String(password || ''), ref.salt, ref.iterations);
  const passOk = safeEqual(got, ref.hash);
  const userOk = safeEqual(String(username || ''), expectedUser);
  return Boolean(parsed && expectedUser && userOk && passOk);
}

// ── Sessions ──────────────────────────────────────────────────────────────

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
const sessionSecret = env => {
  const s = String(env.CMS_SESSION_SECRET || '');
  return s.length >= 32 ? s : '';
};
// Binds sessions to the current password: a new password logs everyone out
const passwordTag = async env => b64url(await hmac(sessionSecret(env), `pw:${env.CMS_PASSWORD_HASH}`)).slice(0, 16);

/** Make a Set-Cookie header value for a new/rotated session. */
export async function issueSession(env, user, { login = Math.floor(Date.now() / 1000) } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { u: user, sid: b64url(crypto.getRandomValues(new Uint8Array(16))), iat: now, login, pw: await passwordTag(env) };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(sessionSecret(env), body));
  const maxAge = Math.max(0, login + SESSION_TTL_S - now);
  return { cookie: `${COOKIE}=${body}.${sig}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`, payload };
}

export const clearSessionCookie = () => `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

function readCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/[$]/g, '\\$&')}=([A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)`));
  return m ? m[1] : '';
}

/**
 * Validate the session cookie.
 * @returns {Promise<null | { user, csrf, rotateCookie? }>}
 */
export async function getSession(request, env) {
  const secret = sessionSecret(env);
  if (!secret || !parseHash(env.CMS_PASSWORD_HASH)) return null;
  const raw = readCookie(request);
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!safeEqual(b64url(await hmac(secret, body)), sig)) return null;
  let p;
  try { p = JSON.parse(new TextDecoder().decode(unb64url(body))); } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (typeof p.login !== 'number' || now > p.login + SESSION_TTL_S || p.iat > now + 60) return null;
  if (!safeEqual(String(p.pw || ''), await passwordTag(env))) return null;
  if (!safeEqual(String(p.u || ''), String(env.CMS_USERNAME || ''))) return null;

  const session = { user: p.u, csrf: b64url(await hmac(secret, `csrf:${p.sid}`)) };
  if (now - p.iat > ROTATE_AFTER_S) {
    const fresh = await issueSession(env, p.u, { login: p.login });
    session.rotateCookie = fresh.cookie;
    session.csrf = b64url(await hmac(secret, `csrf:${fresh.payload.sid}`));
  }
  return session;
}

// ── CSRF / origin ─────────────────────────────────────────────────────────

/** State-changing admin calls must be same-origin JSON. */
export function isSameOriginJson(request) {
  const url = new URL(request.url);
  const site = request.headers.get('Sec-Fetch-Site');
  if (request.headers.get('Origin') !== url.origin) return false;
  if (site && site !== 'same-origin') return false;
  return /^application\/json\b/i.test(request.headers.get('Content-Type') || '');
}

export const csrfOk = (request, session) =>
  Boolean(session) && safeEqual(request.headers.get('X-CSRF-Token') || '', session.csrf);

// ── Login lockout (memory + Cache API, shared within a data centre) ───────

const _fails = new Map();
const lockKey = ip => new Request(`https://cms-lock.invalid/${encodeURIComponent(ip)}`);

async function failCount(ip) {
  const now = Date.now();
  let e = _fails.get(ip);
  try {
    const hit = await caches.default.match(lockKey(ip));
    if (hit) {
      const c = await hit.json();
      if (!e || c.count > e.count) e = c;
    }
  } catch {}
  if (e && now - e.start > LOCK_WINDOW_S * 1000) return { count: 0, start: now };
  return e || { count: 0, start: now };
}

export async function isLockedOut(ip) {
  return (await failCount(ip)).count >= LOCK_MAX;
}

export async function recordFailure(ip, ctx) {
  const e = await failCount(ip);
  e.count += 1;
  _fails.set(ip, e);
  if (_fails.size > 5000) _fails.clear();
  const put = caches.default.put(lockKey(ip), new Response(JSON.stringify(e), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${LOCK_WINDOW_S}` },
  })).catch(() => {});
  ctx?.waitUntil?.(put);
}

export async function clearFailures(ip) {
  _fails.delete(ip);
  try { await caches.default.delete(lockKey(ip)); } catch {}
}
