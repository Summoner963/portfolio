// worker/cms-proxy.js
// Proxies CMS read and write requests to Google Apps Script
// after verifying the session token.

import { verifyToken } from './cms-auth.js';

// ── Shared: verify token + parse body ────────────────────────────────────────

async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim();
  const jwtSecret  = env.CMS_JWT_SECRET || '';
  return verifyToken(token, jwtSecret);
}

async function forwardToScript(body, env) {
  const scriptUrl    = env.CMS_APPS_SCRIPT_URL    || '';
  const scriptSecret = env.CMS_APPS_SCRIPT_SECRET || '';

  if (!scriptUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'Apps Script not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp   = await fetch(scriptUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, secret: scriptSecret }),
    });
    const result = await resp.json();
    return new Response(JSON.stringify(result), {
      status:  resp.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status:  502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── /api/cms/read  (POST) ─────────────────────────────────────────────────────
// Body: { sheet: "blog" | "chords" | "blogimage" | "faq" }
// Returns: { ok: true, rows: [...] }

export async function handleCMSRead(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const session = await authenticate(request, env);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status:  401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status:  400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Whitelist allowed sheets
  const ALLOWED = new Set(['blog', 'blogimage', 'faq', 'chords']);
  const sheet   = (body.sheet || '').toLowerCase().trim();
  if (!ALLOWED.has(sheet)) {
    return new Response(JSON.stringify({ ok: false, error: `Unknown sheet: ${sheet}` }), {
      status:  400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return forwardToScript({ action: 'read', sheet }, env);
}

// ── /api/cms/write  (POST) ────────────────────────────────────────────────────
// Body: { action: "append"|"update"|"delete", sheet, row?, slug?, slugField? }

export async function handleCMSWrite(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const session = await authenticate(request, env);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status:  401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status:  400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ALLOWED_ACTIONS = new Set(['append', 'update', 'delete']);
  if (!ALLOWED_ACTIONS.has(body.action)) {
    return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${body.action}` }), {
      status:  400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return forwardToScript(body, env);
}