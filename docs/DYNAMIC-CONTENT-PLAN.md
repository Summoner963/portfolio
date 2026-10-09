# Plan: every visible text editable from the CMS — DONE (2026-10-09, commits 0af3727 31647dd ad09dae)

Goal: no hard-coded content. All text comes from Google Sheets and is editable in
`/back-lab`. Current code text stays only as a **fallback** if the Sheet is unreachable.

## 1. New tab `Site` (one-off text) — columns `Key | Value`
Prefill with today's text from `public/index.html` (line numbers as of 2026-10-09):

| Key | Current value (source) |
|---|---|
| hero_badge | Available for Internship & Junior Roles (114) |
| hero_title | Dev & QA Engineer (115, "QA" line break → `\|`) |
| hero_subtitle | (118) |
| hero_cta_text / hero_cta_link | View Projects ↓ / /projects (124) |
| stat1_num / stat1_label | 4+ / Projects Built (127) |
| stat2_num / stat2_label | 3+ / Years Coding (128) |
| eyebrow_featured, eyebrow_skills, eyebrow_projects, eyebrow_blog, eyebrow_experience, eyebrow_about, eyebrow_contact | 139, 180, 194, 208, 257, 270, 317 |
| heading_skills … heading_contact | section `<h2>` texts |
| about_location, about_availability, about_languages, about_focus, about_email | 281–301 |
| edu_degree, edu_university | 304–305 |
| contact_intro | contact paragraph |
| contact_email, contact_phone, contact_linkedin, contact_facebook | 328–338 |
| footer_left, footer_right | 377–379 |
| consent_text | cookie banner text |
| meta_title_*, meta_desc_* (per route) | `ROUTES` in `public/js/shared/render.js` |

Needs: tab GID → `SITE_GID` in `wrangler.toml` + `worker/sheets.js`; publish the tab.

## 2. List tabs get editing keys
`Projects`, `Skills`, `Experience` (and `Featured`): add `ID` (Apps Script auto-fills),
optional `Order` (display order) and `Status` (draft hides). About: keep `bio1..bio4`.
**Need from user:** exact header rows of Projects, Skills, Experience, About, Featured, FAQ.

## 3. Code changes (in order)
1. `worker/sheets.js` + `wrangler.toml`: add `site` sheet; `getSiteText(env)` → key→value map.
2. `public/js/shared/render.js`: `siteText(map, key, fallback)`; templates read it.
3. `worker/pages.js` + `worker/shell.js`: inject hero/stats/contact/about-info/footer/eyebrows
   via HTMLRewriter on every page (from `Site`), fallback = current HTML.
4. Client views: read `Site` once (cached) for SPA navigation.
5. `worker/cms-proxy.js`: allow-list `site`, `projects`, `skills`, `exp`, `about`, `featured`
   with field rules (key = `Key` for site, `ID` for lists).
6. `tools/apps-script/Code.gs`: add those tabs to `TABS` (tab names + key column).
7. CMS (`public/js/views/cms.js`): new tabs — Site settings (form grouped: Home, About,
   Contact, Footer, SEO), Projects / Skills / Experience (list + add/edit/delete/reorder),
   About bio, Featured (pick posts), Contact FAQ.
8. Tests: extend `tests/cms-form.test.html` (fake API) + unit tests for `siteText`.
9. Run `npm test`, `npm run test:browser`, push → check preview.

## 4. Order of work next session
User first sends: header rows (step 2) + creates `Site` tab and sends its GID.
Then build steps 1–9 in one go (~half a day).

## 5. Data received from user (2026-10-09)
- `Site` tab created: columns `Key | Value`, **GID 1953062973** (published).
- Exact headers (row 1):
  - Blog: `ID Title Slug Category Excerpt Content Date Last_Modified Tags Image_URL Image_Alt Table_HTML Status`
  - Featured: `Slug`
  - FAQ: `Blog_Slug FAQ_Number FAQ_Question FAQ_Answer`
  - BlogImage: `Blog_Slug Img_Number Img_URL Img_Alt` (headers have leading spaces — trim)
  - Projects: `num title desc highlights stack link featured span2`
  - Skills: `icon title color tags`
  - Experience: `date role org bullets`
  - About: `bio1 bio2 bio3 bio4`

## 6. Bugs found from the headers (fix first)
- Projects: code reads `bullets`/`wide`, Sheet has **`highlights`/`span2`** → bullet points and
  wide cards never show. Fix in `projectsHTML()` (read `highlights || bullets`, `span2 || wide`;
  use `num` if present). No Sheet renames.
- Projects/Skills/Experience have no `ID`: add an `ID` column (Apps Script auto-fills) so the CMS
  can edit/delete a row; optional `Order`, `Status`.
