// worker/http.js — headers, redirects and rate limiting for every response.

import { SITE_URL } from '../public/js/shared/render.js';

const CANONICAL_HOST = new URL(SITE_URL).host;

// CSP decisions:
//  script-src  'self' + Google tag + Cloudflare Web Analytics only. No
//              'unsafe-inline': the site has no inline scripts or on*= handlers
//              (JSON-LD blocks are data and are not affected by CSP).
//  style-src   keeps 'unsafe-inline' — templates and the CMS editor use style
//              attributes; style injection is far lower risk than script.
//  img-src     https: because Sheet rows may point images at any host.
//  connect-src GA4 collection endpoints (region-specific subdomains → wildcards).
//  frame-ancestors 'none' + X-Frame-Options DENY: no framing (clickjacking).
export const SECURITY_HEADERS = {
  'X-Frame-Options':            'DENY',
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Strict-Transport-Security':  'max-age=31536000',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

/** Copy a response with security headers (and noindex on non-production hosts). */
export function finalize(res, { noindex = false } = {}) {
  const out = new Response(res.body, res); // unlocks immutable headers
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  if (noindex) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

export const redirect = (location, status = 301) =>
  new Response(null, { status, headers: { Location: location, 'Cache-Control': 'public, max-age=3600' } });

/**
 * Host-level decisions.
 *  <project>.pages.dev           → 301 to the custom domain (duplicate content)
 *  <hash|branch>.<project>.pages.dev → served, but noindex (preview deployments)
 *  www.<domain>                  → 301 to apex
 * @returns {{ redirectTo?: string, noindex: boolean }}
 */
export function hostPolicy(url) {
  const host = url.hostname;
  if (host.endsWith('.pages.dev')) {
    return host.split('.').length === 3
      ? { redirectTo: SITE_URL + url.pathname + url.search, noindex: false }
      : { noindex: true };
  }
  if (host === `www.${CANONICAL_HOST}`) return { redirectTo: SITE_URL + url.pathname + url.search, noindex: false };
  return { noindex: false };
}

const LEGACY_REDIRECTS = {
  '/blog/free-domain-nepal-guide':    '/blog/get-free-domain-in-nepal',
  '/blog/free-domain-in-nepal-guide': '/blog/get-free-domain-in-nepal',
  '/blog/free-domain-in-nepal':       '/blog/get-free-domain-in-nepal',
};

/**
 * Path normalisation for page URLs (never for /api/*). Returns the
 * canonical path+query to 301 to, or null if the URL is already canonical.
 */
export function canonicalPath(url) {
  let path = url.pathname;
  if (path.startsWith('/api/')) return null;
  path = path.replace(/\/{2,}/g, '/');                 // //blog → /blog
  path = path.replace(/\/index\.html?$/i, '/');        // /index.html → /
  if (path.length > 1) path = path.replace(/\/+$/, ''); // /skills/ → /skills
  path = LEGACY_REDIRECTS[path] || path;
  return path === url.pathname ? null : path + url.search;
}

// ── Rate limiting (per isolate; Cloudflare WAF rules are the real defence) ─
const RL_WINDOW_MS = 60_000;
const RL_MAX       = 120;
const _rl = new Map();
export function isRateLimited(ip, max = RL_MAX, windowMs = RL_WINDOW_MS, bucket = _rl) {
  const now = Date.now();
  const e = bucket.get(ip);
  if (!e || now - e.start > windowMs) {
    if (bucket.size > 5000) bucket.clear(); // bound memory
    bucket.set(ip, { count: 1, start: now });
    return false;
  }
  return ++e.count > max;
}

export const isSearchCrawler = ua =>
  /googlebot|bingbot|adsbot-google|google-inspectiontool|mediapartners-google/i.test(ua || '');
