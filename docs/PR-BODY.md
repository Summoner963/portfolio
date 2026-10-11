## What

Ships the modular code (`public/` + `worker/`) and the admin CMS, with every SEO and security
practice from the current `main` kept, and several raised to current best practice.

## Why

`main` is one large HTML file and one large worker. The modular branch is easier to extend, but
it had lost `main`'s recent fixes (GA4 consent, soft-404 fix, pages.dev redirect, safe JSON-LD,
draft handling, CSP). This branch ports them and hardens the CMS.

## Highlights

- **Only `public/` is deployed.** Worker source, notes and tests can no longer be downloaded
  (they were reachable on `dev`).
- **Server-rendered SEO for every route:** HTMLRewriter adds title, description, canonical,
  OG/Twitter tags, JSON-LD and the page content to the first HTML. One template module is
  shared by the worker and the browser, so the two can't drift.
- **Real status codes and redirects:**
  - unknown or draft posts: 404 + noindex
  - Sheets down: 503
  - trailing slash, `www` and pages.dev: 301
  - missing files: real 404
- **Sheets caching:** stale-while-revalidate, a 7-day last-good copy, and a timeout.
- **CMS login:**
  - salted PBKDF2 password hash
  - `__Host-` HttpOnly SameSite=Strict session cookie
  - CSRF token, and lockout after 5 failed logins
  - allow-listed and validated writes, with spreadsheet formula injection neutralised
- **Strict CSP:** no `'unsafe-inline'` for scripts.
- **GA4 with Consent Mode v2:** one page_view per route, a cookie banner and a privacy page.
- **Static files skip the worker** (`_routes.json`), so the free request quota goes much further.
- **Everything visible is editable in the CMS:** Site text (Site tab), Projects, Skills,
  Experience, About, Featured posts, Contact FAQ, and posts with a lossless visual ⇄ Sheet editor.
- **Each URL's HTML holds only its own content:** other views are inert `<template>`s.
- **Internal links between posts:** older/newer and related posts on every post;
  "Updated <date>"; `wordCount`/`articleSection` in BlogPosting; titles kept to 60 characters.
- **For AI agents and feed readers:** `/blog/<slug>.md`, `/llms.txt`, `/llms-full.txt`,
  `/feed.xml` (also a second sitemap).
- **IndexNow** (Bing & co.): key file + CMS Notify buttons; only live URLs are sent.

## Verification

- `npm test`: 47 unit tests (escaping, markdown, slugs, JSON-LD, auth/CSRF, CMS validation,
  redirects, related posts, agent markdown, IndexNow).
- `npm run test:browser`: editor 37 + CMS 33 checks; `npm run test:e2e`: 19 SPA checks
  in headless Chrome against `dev:mock`.
- 26-case snapshot compared against `main` (`tests/baseline/`): every difference is
  intentional, and the sitemap URLs and lastmod dates are unchanged.
- Full repo run locally as configured:
  - private files 404
  - deep links 200
  - headers present
  - admin noindex
- Headless Edge: no console or CSP errors, one H1 per page, and the correct GA dataLayer order.
- Preview checklist: `tests/MANUAL-CHECKLIST.md`.

## Deploy notes

Before merging, set the new production secrets (`CMS_USERNAME`, `CMS_PASSWORD_HASH`,
`CMS_SESSION_SECRET`). The full steps, including rollback, are in `docs/DEPLOYMENT.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
