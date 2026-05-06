// worker/cms-auth.js
// Handles /api/cms/auth (login) and token verification.
// All credentials come from Cloudflare secrets — never from wrangler.toml.

import { escHtml } from './utils.js';

const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

// ── SHA-256 helper (Web Crypto API — available in Workers runtime) ────────

async function sha256(message) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(message)
  );
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── HMAC-SHA256 for token signing ─────────────────────────────────────────

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(secret, data, signature) {
  const expected = await hmacSign(secret, data);
  return expected === signature;
}

// ── Token format: base64(payload).signature ──────────────────────────────

async function createToken(username, secret) {
  const payload = btoa(JSON.stringify({
    u:   username,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  }));
  const sig   = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const valid = await hmacVerify(secret, payload, sig);
  if (!valid) return null;
  try {
    const data = JSON.parse(atob(payload));
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Login handler — POST /api/cms/auth ───────────────────────────────────

export async function handleCMSAuth(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { username, password } = body;

  if (!username || !password) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing credentials' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expectedUser = env.CMS_USERNAME     || '';
  const expectedHash = env.CMS_PASSWORD_HASH || '';
  const jwtSecret    = env.CMS_JWT_SECRET    || '';

  if (!expectedUser || !expectedHash || !jwtSecret) {
    console.warn('[cms-auth] CMS secrets not configured in Cloudflare dashboard');
    return new Response(JSON.stringify({ ok: false, error: 'CMS not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const passwordHash = await sha256(password);
  const usernameOk   = username === expectedUser;
  const passwordOk   = passwordHash === expectedHash.toLowerCase();

  if (!usernameOk || !passwordOk) {
    // Constant-time-ish delay to slow brute force
    await new Promise(r => setTimeout(r, 400));
    return new Response(JSON.stringify({ ok: false, error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = await createToken(username, jwtSecret);

  return new Response(JSON.stringify({ ok: true, token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}