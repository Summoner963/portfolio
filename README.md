# suman-dangal.com.np

Portfolio and blog of Suman Dangal. Plain HTML, CSS and JavaScript (ES modules),
content in Google Sheets, hosted free on Cloudflare Pages with an advanced-mode
worker. No frameworks and no npm dependencies.

## How it works

```
Browser ──► Cloudflare Pages
              │
              ├─ /css/* /js/* icons manifest ──► served as static files (never run the worker)
              │                                   rules: public/_routes.json, headers: public/_headers
              │
              └─ everything else ──► worker (public/_worker.js → worker/index.js)
                   ├─ pages  → public/index.html + HTMLRewriter: per-page <head>,
                   │           JSON-LD and the page content rendered on the server
                   ├─ /api/data?sheet=… → published Google Sheet CSV (allow-listed, drafts removed)
                   ├─ /sitemap.xml /robots.txt /llms.txt → generated
                   └─ /back-lab + /api/cms/* → admin CMS (own login) → Google Apps Script → Sheet
```

| Folder / file | What it is | Deployed? |
|---|---|---|
| `public/` | Everything Cloudflare serves (Pages output directory) | yes |
| `public/js/shared/render.js` | HTML templates, markdown, escaping, JSON-LD — used by **both** browser and worker | yes |
| `public/js/` | SPA: `main.js` (routes), `router.js`, `seo.js`, `api.js`, `consent.js` (GA4), `views/*` | yes |
| `public/_worker.js` | One line: re-exports `worker/index.js` (Pages bundles it) | as the worker |
| `worker/` | Worker source: `index.js` router, `pages.js`, `shell.js`, `sheets.js`, `http.js`, `seo-files.js`, `sanitize.js`, `auth.js`, `cms-proxy.js` | bundled, never served |
| `tests/` | Unit tests, Sheets mock, snapshot tool, LIVE baseline, manual checklist | no |
| `tools/` | `make-cms-secrets.mjs` (run locally) | no |
| `docs/` | Deployment, security summary, backlog | no |
| `wrangler.toml` | Project config — **source of truth** for plain variables | no |

### Routing and SEO
- History API URLs (`/blog/my-post`), real `<a href>` links, one `<h1>` per page.
- The worker renders every page's title, description, canonical (always the custom domain),
  Open Graph/Twitter tags, JSON-LD and main content into the first HTML. The SPA keeps that
  DOM on first load and handles navigation afterwards.
- Real status codes: unknown page/post → 404 + noindex; Google Sheets down → 503 (never a false 404).
- 301s: `*.pages.dev` production → custom domain, `www` → apex, trailing slash, `/index.html`,
  old blog slugs (`worker/http.js`). Preview deployments get `noindex`.

### Content (Google Sheets)
Tabs are read through the sheet's **Publish to web** CSV link. The worker caches them
(memory + Cloudflare Cache API, fresh 5 min, then served stale while refreshing, last-good copy
kept 7 days). Edits show up within a few minutes.

Blog columns: `Title, Slug, Category, Excerpt, Content, Date, Last_Modified, Tags, Image_URL,
Image_Alt, Table_HTML` + optional **`Status`** — `draft`, `unpublished`, `hidden`, `private`,
`no` or `false` hides the post everywhere (page, list, sitemap, API). Blank = published.

### Site text (`Site` tab: `Key | Value`)
Every one-off text — home hero, stats, section labels/headings, About sidebar, contact tiles,
footer, cookie banner, page titles/descriptions — is a key in `SITE_FIELDS`
(`public/js/shared/render.js`). Elements in `public/index.html` carry `data-site="key"`; the worker
fills them on every page. No row = current text; empty value = hidden (where marked).
List tabs (Projects, Skills, Experience) use your column names; optional `Order` and `Status`
columns sort and hide rows.

### Admin CMS (`/back-lab`)
Sections: Blog, Site text, Projects, Skills, Experience, About, Featured, Contact FAQ.

- Login: username + password checked against a salted PBKDF2 hash; signed HttpOnly session
  cookie (8 h); CSRF token on every change; 5 failed logins → 15 min lockout.
- Post editor (`public/js/views/cms-editor.js`): **Visual** pane (headings, bold, italic,
  ~~strike~~, code, links, lists, quotes, Note/Tip/Warning/Important/Info callouts, image
  placeholders) kept in sync with the **Sheet format** pane — the exact cell text:
  first line plain, every following line starting with `|`. Opening and saving a post without
  edits stores it byte-for-byte unchanged. Draft/Published switch writes the `Status` column.
- Saves go through `worker/cms-proxy.js` (allow-listed sheets/fields, validation, formula
  neutralisation) to your Google Apps Script (`tools/apps-script/Code.gs`), which writes to the Sheet.
- Never indexed (`noindex` header + meta), not listed in robots.txt or the sitemap.

## Run locally

Requirements: Node 20+ (Wrangler is fetched by `npx`, nothing is installed in the project).

```bash
npm test                      # unit tests (node:test)
npm run test:browser          # editor + CMS form tests in headless Chrome/Edge

# With fake data — no Google account or secrets needed
npm run mock-sheets           # terminal 1: serves tests/fixtures/sheets/*.csv
npm run dev:mock              # terminal 2: http://127.0.0.1:8788

# With your real Sheet: copy .dev.vars.example → .dev.vars, fill it in (git-ignored), then
npm run dev
```

Check SEO output against the LIVE baseline: with `dev:mock` running, `npm run snapshot`
writes `tests/latest/` — compare with `tests/baseline/`.

## Deploy
Git integration: push a branch → preview deployment; merge to `main` → production.
Full steps, settings, secrets and rollback: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.
Test with **[tests/MANUAL-CHECKLIST.md](tests/MANUAL-CHECKLIST.md)**.

## Add a new page type (e.g. `/talks`)
1. **Route metadata** — `public/js/shared/render.js` → add to `ROUTES`:
   `'/talks': { view: 'talks', css: [], heading: 'Talks', title: 'Talks | Suman Dangal', description: '…' }`
   (sitemap, llms.txt and the worker's `<head>` pick it up automatically).
2. **Markup** — `public/index.html`: add `<div id="view-talks" class="view" role="region" aria-label="Talks">`
   with a `<h2 class="section-heading">Talks</h2>` and an empty container, e.g. `<div id="talksGrid"></div>`.
3. **Client route** — `public/js/main.js` → add `'/talks': () => import('./views/talks.js').then(m => m.renderTalks())`
   to `SECTIONS`; `public/js/router.js` → add `'/talks': 'view-talks'` to the view map.
4. **If it comes from a Sheet tab:**
   - `worker/sheets.js` → `talks: env.TALKS_GID || '<gid>'`, and `TALKS_GID` in `wrangler.toml [vars]`
     (this also allow-lists it for `/api/data?sheet=talks`); `public/js/api.js` → `CFG.api.talks`.
   - `public/js/shared/render.js` → a `talksHTML(rows)` template (escape everything with `esc()`).
   - `public/js/views/talks.js` → copy `views/skills.js`, swap the template/sheet/ids.
   - `worker/pages.js` → add `'/talks': { sheet: 'talks', target: '#talksGrid', html: rows => R.talksHTML(rows, { reveal: false }) }` to `SECTION`.
5. `npm test`, run `dev:mock`, check `/talks` (view source: title, canonical, one `<h1>`, content).

## Security notes
No secrets in this repo. Secrets live only in Cloudflare (see `wrangler.toml` header and
[docs/SECURITY.md](docs/SECURITY.md)). Report issues to sumandangal888@gmail.com.
