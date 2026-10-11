# Manual test checklist

Run on the **preview deployment** first, then again on **suman-dangal.com.np**
after release. `PREVIEW` = the branch preview URL Cloudflare shows for the
deployment (e.g. `https://merge-main-practices.portfolio-1e6.pages.dev`).

## 1. Pages and links
- [ ] Open every nav link; each page shows content (not skeletons) and one heading.
- [ ] Refresh on `/blog/<a real post>`, `/skills`, `/blog?page=2` — page loads directly.
- [ ] Click a blog card, the back link, pagination, a featured post — no full reload, URL updates.
- [ ] Browser back/forward works.
- [ ] At the end of a post: **Older/Newer post** links and **Related posts** cards; a post
      with a later `Last_Modified` shows "Updated <date>" next to its date.
- [ ] `/no-such-page` and `/blog/no-such-post` show "not found" (DevTools → Network: status **404**).
- [ ] Missing file `/js/nope.js` → 404.

## 2. View source (Ctrl+U) — what Google sees first
- [ ] Home: title "Suman Dangal — Dev & QA Engineer", canonical `https://suman-dangal.com.np/`, `ProfilePage` JSON-LD.
- [ ] A post: its own `<title>`, meta description, canonical `https://suman-dangal.com.np/blog/<slug>`, `og:type article`, `BlogPosting` JSON-LD with `datePublished`/`dateModified`, the article text and one `<h1>`.
- [ ] `/projects`: project cards are in the source (not empty).
- [ ] Canonicals never contain `pages.dev`.
- [ ] Inactive views are inside `<template data-view-tpl>`; e.g. the source of `/skills`
      shows no blog cards or hero text outside a `<template>`.
- [ ] A post's `<head>` has `<link rel="alternate" type="text/markdown" href="…/blog/<slug>.md">`
      and every page has the RSS `<link rel="alternate" type="application/rss+xml">`.

## 3. Generated files
- [ ] `/sitemap.xml` lists every published post (no drafts) with `lastmod`.
- [ ] `/robots.txt` allows all, has the Sitemap line, does **not** mention `/api/` or `/back-lab`.
- [ ] `/llms.txt` lists pages and posts (post links end in `.md`).
- [ ] `/llms-full.txt` contains every published post in full; `/blog/<post>.md` shows one
      post as markdown with header `X-Robots-Tag: noindex`; `/blog/<draft>.md` → 404.
- [ ] `/feed.xml` opens as RSS (newest first) and validates at https://validator.w3.org/feed/.
- [ ] `/robots.txt` lists both `sitemap.xml` and `feed.xml`.
- [ ] `/3b9e9c19eba66dcbd80bc8a0a09274f8.txt` shows the same key; any other `/<something>.txt` → 404.
- [ ] `/_routes.json`, `/_headers`, `/_worker.js` are **not** downloadable (expect 404).

## 4. Redirects and duplicates
- [ ] `https://portfolio-1e6.pages.dev/blog` → 301 → `https://suman-dangal.com.np/blog` (production only).
- [ ] PREVIEW responses carry `X-Robots-Tag: noindex` (DevTools → Network → Headers).
- [ ] `/skills/` → `/skills`; `/index.html` → `/`; `/blog/free-domain-in-nepal` → `/blog/get-free-domain-in-nepal`.

## 5. Security
- [ ] https://securityheaders.com on the home page: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy present.
- [ ] DevTools Console on several pages: no "Refused to … Content Security Policy" errors.
- [ ] Static files (`/js/main.js`) have no `Content-Security-Policy` header → served without the worker.

## 6. CMS (`/back-lab`)
- [ ] Shows the login form; wrong password → "Invalid username or password".
- [ ] 5 wrong attempts → "Too many attempts" (wait 15 min or use another network to continue).
- [ ] Correct login → dashboard. DevTools → Application → Cookies: `__Host-sd_session` is HttpOnly, Secure, SameSite=Strict.
- [ ] Create a test post (slug e.g. `test-post-delete-me`) with **Visibility: Draft** → not on
      `/blog`; switch to Published → appears within a few minutes.
- [ ] Drafts: in the Sheet, set a post's `Status` cell to `draft` → it disappears from `/blog`, the sitemap and `/api/data`; its URL returns 404. Clear the cell to publish again.
- [ ] Edit a post → change visible on the site within a few minutes; `dateModified` updates.
- [ ] Save a post whose content starts with `- ` → it shows as a list (formula guard didn't add a visible `'`).
- [ ] Delete the test post → gone from `/blog` after a few minutes; its URL then returns 404.
- [ ] Title/Excerpt counters show `n / 60` and `n / 155` and turn amber when longer.
- [ ] **Notify** on a published post (production only): toast "Sent" or "Received". Pressing
      it again within 10 minutes → "Already sent in the last 10 minutes".
- [ ] Sign out → back to the login form; refresh stays signed out.
- [ ] `/back-lab` response headers: `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.

## 7. Analytics (GA4 → Reports → Realtime)
- [ ] First visit shows the cookie banner; Decline → no `_ga` cookie set.
- [ ] Accept → `_ga` cookie appears; Realtime shows **one** page_view per page change (click 3 pages → 3 views, not 6).
- [ ] "Cookie settings" in the footer reopens the banner.

## 8. External tools
- [ ] Google Search Console → URL Inspection → **Test live URL** on a post: "URL is available to Google", screenshot shows the article.
- [ ] Rich Results Test (search.google.com/test/rich-results) on a post: BlogPosting/Breadcrumb/FAQ detected, no errors.
- [ ] PageSpeed Insights / Lighthouse (mobile) on home and a post: note scores; no CLS from images.
- [ ] LinkedIn Post Inspector on a post URL: title, description and cover image appear.
- [ ] Bing Webmaster Tools → URL Inspection on a post after Notify: "Discovered"/"Indexed".
