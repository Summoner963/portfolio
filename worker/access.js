// worker/access.js
// ═══════════════════════════════════════════════════════════════════════════
//  Cloudflare Access verification for the admin UI and CMS API.
//
//  Cloudflare Access sits in front of /back-lab* and /api/cms/* and asks for
//  the login. The worker does NOT trust that blindly: every admin request
//  must carry a valid Access JWT (header Cf-Access-Jwt-Assertion), checked
//  here with WebCrypto — RS256 signature against the team's public keys,
//  plus iss, aud, exp and nbf. No library needed.
//
//  Config (Cloudflare Pages → Settings → Variables):
//    ACCESS_TEAM_DOMAIN  https://<team>.cloudflareaccess.com   (plain var)
//    ACCESS_AUD          Application Audience (AUD) tag(s), comma-separated
//                        (custom-domain app, and the Pages preview app)
//  Missing config ⇒ every admin request is refused (fail closed).
//
//  Docs: developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
// ═══════════════════════════════════════════════════════════════════════════

const JWKS_TTL_MS = 60 * 60 * 1000;
const LEEWAY_S    = 60;
let _jwks = { domain: '', keys: [], at: 0 };

const b64urlBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64urlJSON  = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function getKeys(domain, force = false) {
  if (!force && _jwks.domain === domain && Date.now() - _jwks.at < JWKS_TTL_MS) return _jwks.keys;
  const res = await fetch(`${domain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`certs HTTP ${res.status}`);
  const { keys = [] } = await res.json();
  _jwks = { domain, keys, at: Date.now() };
  return keys;
}

/** Normalise "team" / "team.cloudflareaccess.com" / "https://…/" to an origin. */
export function teamOrigin(v) {
  v = String(v || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https:\/\//.test(v)) v = `https://${v.includes('.') ? v : `${v}.cloudflareaccess.com`}`;
  return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(v) ? v : '';
}

/**
 * Verify an Access JWT. Returns the claims (incl. email) or null.
 * @param {string} token
 * @param {{ domain: string, aud: string|string[], now?: number, keys?: object[] }} opts
 */
export async function verifyAccessJwt(token, { domain, aud, now = Date.now() / 1000, keys } = {}) {
  const allowed = (Array.isArray(aud) ? aud : String(aud || '').split(',')).map(a => a.trim()).filter(Boolean);
  if (!token || !domain || !allowed.length) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try { header = b64urlJSON(parts[0]); claims = b64urlJSON(parts[1]); } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;

  let jwk = (keys || await getKeys(domain)).find(k => k.kid === header.kid);
  if (!jwk && !keys) jwk = (await getKeys(domain, true)).find(k => k.kid === header.kid); // key rotation
  if (!jwk) return null;

  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;

  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== domain || !auds.some(a => allowed.includes(a))) return null;
  if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_S < now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY_S > now) return null;
  return claims;
}

/** The authenticated admin's claims, or null. Never throws. */
export async function adminIdentity(request, env) {
  const url = new URL(request.url);
  // Local development only: wrangler pages dev on localhost has no Access in front.
  if (env.ACCESS_DEV_BYPASS === 'true' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) {
    return { email: 'local-dev@localhost' };
  }
  try {
    return await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), {
      domain: teamOrigin(env.ACCESS_TEAM_DOMAIN), aud: String(env.ACCESS_AUD || ''),
    });
  } catch (e) {
    console.warn('[access] verification error:', e.message);
    return null;
  }
}

/**
 * CSRF guard for state-changing admin calls. The Access cookie defaults to
 * SameSite=None, so the browser would attach it to cross-site requests;
 * require same-origin + JSON so a third-party page cannot drive the CMS.
 */
export function isSameOriginJson(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (origin !== url.origin) return false;
  if (site && site !== 'same-origin') return false;
  return /^application\/json\b/i.test(request.headers.get('Content-Type') || '');
}
