// worker/cms-proxy.js
// Proxies write requests to Google Apps Script after verifying the session token.

import { verifyToken } from './cms-auth.js';

export async function handleCMSWrite(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Verify token
  const authHeader = request.headers.get('Authorization') || '';
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim();
  const jwtSecret  = env.CMS_JWT_SECRET || '';

  const session = await verifyToken(token, jwtSecret);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scriptUrl    = env.CMS_APPS_SCRIPT_URL    || '';
  const scriptSecret = env.CMS_APPS_SCRIPT_SECRET || '';

  if (!scriptUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'Apps Script not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Forward to Apps Script with shared secret
  try {
    const resp = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, secret: scriptSecret }),
    });

    const result = await resp.json();
    return new Response(JSON.stringify(result), {
      status: resp.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}