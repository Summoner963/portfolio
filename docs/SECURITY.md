# Security summary (October 2026)

## Fixed in this release
| Area | Before (DEV branch) | Now |
|---|---|---|
| Deployed files | Whole repo root uploaded; worker source, notes and an archived worker were downloadable | Only `public/` is deployed; private files return 404 (verified with a canary `.dev.vars`) |
| CMS password | Unsalted SHA-256 in a secret | PBKDF2-SHA256, random salt, 20k iterations (fits the Free plan's 10 ms CPU); generated 143-bit password |
| CMS session | Bearer token in `sessionStorage` (readable by any XSS) | `__Host-` cookie: HttpOnly, Secure, SameSite=Strict, 8 h absolute, hourly rotation, bound to the password hash |
| CSRF | None | Per-session token + same-origin + JSON on every CMS POST |
| Login brute force | 8 tries / 15 min per isolate (memory only) | 5 tries / 15 min per IP, shared within a data centre (Cache API); constant-time checks; generic errors |
| CMS writes | Any sheet name and any row forwarded to Apps Script | Allow-listed sheets/actions/key column; per-field type and length rules; formula injection neutralised; 300 KB cap |
| Error leakage | Apps Script errors (`e.message`) returned to the browser | Generic messages; details only in logs; logs never include the Sheet URL or ID |
| XSS via Sheet content | JSON-LD built with raw `JSON.stringify` (could close `</script>`); `javascript:` links allowed in some places | Shared `esc()` / `jsonLd()` / `safeUrl()`; markdown escapes first; `Table_HTML` sanitised (HTMLRewriter in the worker, DOMParser in the browser) |
| CSP | `'unsafe-inline'` scripts; GA blocked | No inline scripts at all; `script-src 'self'` + Google tag + Cloudflare analytics; `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors 'none'` |
| Headers | No HSTS; X-Frame-Options SAMEORIGIN | HSTS, DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP; `_headers` covers static files |
| Drafts | Draft rows public (page, sitemap, API) | Hidden everywhere, including FAQ/image rows of unpublished posts |
| Admin indexing | `/back-lab` indexable and listed in robots.txt | `noindex` header + meta, `no-store`, not in robots or the sitemap |
| CORS | Invalid `Access-Control-Allow-Origin: same-origin` header | No CORS headers (same-origin only) |
| Agent / feed files | — | `/blog/<slug>.md`, `/llms-full.txt`, `/feed.xml` only contain published posts (drafts → 404); markdown copies are `noindex` with a canonical Link header |

## Remaining risks / limits
- **Rate limits are per data centre, not global.** A distributed attacker could make more login
  attempts. The random password makes guessing impractical anyway. Optional: one free Cloudflare
  WAF rate-limiting rule on `/api/cms/login`.
- **PBKDF2 at 20k iterations is below OWASP's 600k.** It's a deliberate CPU trade-off on the Free
  plan; the iteration count is stored in the hash and can be raised (up to 100k on Workers) if you
  move to a paid plan.
- **`style-src 'unsafe-inline'` remains,** because templates and the CMS editor use `style=`
  attributes.
- **The Apps Script runs in your Google account.** The reviewed version is in
  `tools/apps-script/Code.gs` (secret check, allow-listed tabs, formula guard). Re-paste it
  there after every change to that file.
- **IndexNow key is public on purpose** (`INDEXNOW_KEY` in `wrangler.toml`, served at
  `/<key>.txt`). It only proves you own the domain to IndexNow; the CMS endpoint that sends
  pings needs a session + CSRF token and only sends URLs that are live on the site.
- **The published Sheet ID is in old git history** (a "Publish to web" ID, low risk). Rotating it
  is optional (re-publish the sheet, then update `SHEET_ID`).
- **`build-notes/` and `_archive/` are untracked now, but still exist in old commits** of this
  public repo. No secrets were found in them (full history scan).

## What you must do outside the code
1. Run `npm run secrets -- <username>` and set `CMS_USERNAME`, `CMS_PASSWORD_HASH` and
   `CMS_SESSION_SECRET` (Preview and Production). Delete `CMS_JWT_SECRET` after launch.
2. Check that your Apps Script rejects a wrong secret and restricts which tabs it writes.
3. Keep `SHEET_ID` and the Apps Script values only in Cloudflare secrets (and your local, git-ignored
   `.dev.vars`).
4. GA4: turn off "Page changes based on browser history events".
5. Optional: Cloudflare → Security → WAF → rate limiting rule for `/api/cms/login`.
6. Optional: make the GitHub repo private (Cloudflare Pages works with private repos).
