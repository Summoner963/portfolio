# Deployment plan — merge-main-practices → production

Hosting: Cloudflare Pages project **portfolio** (`portfolio-1e6.pages.dev`), Git integration
with `Summoner963/portfolio`, production branch `main`, custom domain `suman-dangal.com.np`.
Nothing here has been executed — follow the steps in order.

## 0. Before you start (local, 2 min)
```bash
git checkout merge-main-practices
npm test                      # expect: pass 28, fail 0
```

## 1. Cloudflare Pages settings
Dashboard → **Workers & Pages → portfolio → Settings**.

| Setting | Value | Notes |
|---|---|---|
| Build → Build command | *(empty)* | No build step |
| Build → Build output directory | `public` | `wrangler.toml` also says `./public`; once a deployment uses `wrangler.toml` it is the source of truth and this field becomes read-only |
| Build → Production branch | `main` | |
| Build → Preview branches | All non-production branches (or *Custom*: include `merge-main-practices`) | |
| Compatibility date / variables | from `wrangler.toml` | GIDs and `SHEET_BASE` live in `[vars]`; the dashboard will show them read-only after the first deployment that uses the file |

### Secrets (Settings → Variables and Secrets → Add → Type **Secret**)
Set per environment with the selector at the top (**Preview** first, **Production** in step 5).

| Secret | Preview | Production | How to get it |
|---|---|---|---|
| `SHEET_ID` | ✅ | ✅ (already set) | Sheet → File → Share → Publish to web → the ID between `/d/e/` and `/pub` |
| `CMS_APPS_SCRIPT_URL` | ✅ | ✅ | Apps Script → Deploy → Manage deployments → Web app URL |
| `CMS_APPS_SCRIPT_SECRET` | ✅ | ✅ | the secret your Apps Script checks |
| `CMS_USERNAME` | ✅ new | ✅ new (step 5) | `npm run secrets -- <username>` (see below) |
| `CMS_PASSWORD_HASH` | ✅ new | ✅ new (step 5) | same command |
| `CMS_SESSION_SECRET` | ✅ new | ✅ new (step 5) | same command |
| `CMS_JWT_SECRET` | delete after launch | delete after launch | old login, unused |

Create the three CMS secrets **on your computer**:
```bash
npm run secrets -- suman      # prints a new password ONCE + the three values
```
Save the password in a password manager, paste the three values into Cloudflare, close the
terminal. Never paste them into chats, issues or commits. (This replaces your old `CMS_USERNAME`
/ `CMS_PASSWORD_HASH`; the old `dev` preview's login stops working — expected.)

## 2. Deploy a preview (this is the first real deploy of the new code)
```bash
git push -u origin merge-main-practices
```
Cloudflare builds it automatically (Workers & Pages → portfolio → **Deployments**). Preview URL:
**`https://merge-main-practices.portfolio-1e6.pages.dev`** (plus a hash URL per commit).

In the deployment's build log check: `Using wrangler.toml`/`pages_build_output_dir`,
`Compiled Worker successfully`, no errors.

**If the build fails resolving `../worker/index.js`:** stop and tell me — the fallback is a
build command with esbuild as a dev dependency (needs your approval; see build-notes/architecture.md).

## 3. Test the preview
Use **[tests/MANUAL-CHECKLIST.md](../tests/MANUAL-CHECKLIST.md)** sections 1–7 against the preview
URL. Extra checks only possible here:
- `https://merge-main-practices.portfolio-1e6.pages.dev/_routes.json` → **404** (not downloadable).
- `/js/main.js` response has **no** `Content-Security-Policy` header (static file skipped the worker).
- All responses carry `X-Robots-Tag: noindex` (preview).
- CMS: log in, edit a post, save a post whose content starts with `- `, check the Sheet.
- Workers & Pages → portfolio → **Metrics/Analytics**: CPU time per request well under 10 ms.
- GA4: preview visits count in the same property — Decline the banner on the preview, or
  later filter by hostname in GA4.

Fix anything found on the branch, push again (the preview updates), re-test.

## 4. Open the pull request
```bash
gh pr create --base main --head merge-main-practices \
  --title "Modular site + CMS with LIVE SEO/security practices" \
  --body-file docs/PR-BODY.md
```
(or on GitHub: *Compare & pull request*). The branch already contains `main`
(merge `aa6d052`), so the PR has no conflicts. Review the **Files changed** tab.

## 5. Production secrets, then merge
1. Add `CMS_USERNAME`, `CMS_PASSWORD_HASH`, `CMS_SESSION_SECRET` under **Production**
   (same values as Preview, or run the command again for a separate production password).
2. Keep `SHEET_ID`, `CMS_APPS_SCRIPT_URL`, `CMS_APPS_SCRIPT_SECRET` in Production.
3. Merge the PR (**Create a merge commit**). Cloudflare deploys `main` to production in ~1 min.

## 6. Right after release (15 min)
- Run checklist sections 1–8 on `https://suman-dangal.com.np`.
- These URLs (live sitemap, 2026-10-06) must still return **200** with the same canonical:
  ```
  /  /skills  /projects  /blog  /experience  /about  /contact
  /blog/cloudflare-hosting-nepal
  /blog/get-free-domain-in-nepal
  /blog/google-sheets-as-database
  ```
  and these must 301 to `/blog/get-free-domain-in-nepal`:
  `/blog/free-domain-nepal-guide`, `/blog/free-domain-in-nepal-guide`, `/blog/free-domain-in-nepal`.
- `https://portfolio-1e6.pages.dev/` → 301 to the custom domain.
- Cloudflare → your domain → **Caching → Configuration → Purge Cache → Custom Purge**:
  `https://suman-dangal.com.np/robots.txt` and `https://suman-dangal.com.np/sitemap.xml`
  (an old copy can be edge-cached for up to a day, as happened last week).

## Rollback
**Fast (seconds):** Workers & Pages → portfolio → **Deployments** → *All deployments* → the
previous **production** deployment (commit `3000db3`) → ⋯ → **Rollback to this deployment**.
Only successful production deployments can be rollback targets.
Docs don't say whether a rollback re-uses that deployment's variable snapshot; the old code
only needs `SHEET_ID`, which stays set, so it is safe either way.

**Permanent:** revert the merge on `main` and push (rebuilds the old code):
```bash
git checkout main && git pull
git revert -m 1 <merge-commit-sha>
git push
```
Keep `SHEET_ID` until you are sure you won't roll back.

## Post-launch (2–4 weeks)
- **Search Console:** Sitemaps → submit `https://suman-dangal.com.np/sitemap.xml` again;
  URL Inspection → *Test live URL* + *Request indexing* for home and each post.
- Watch **Pages (indexing)** for new "Soft 404", "Not found (404)", "Duplicate without canonical",
  "Alternate page with proper canonical" — the only expected new 404s are draft/deleted posts.
- Watch **Core Web Vitals** and **PageSpeed Insights** for home + a post.
- **GA4:** Admin → Data streams → Enhanced measurement → Page views ⚙ → turn **off**
  "Page changes based on browser history events" (the site sends page_view itself).
- Cloudflare **Workers metrics**: requests/day far below 100,000; CPU per request < 10 ms.
- After a week with no rollback: delete `CMS_JWT_SECRET`; decide whether to delete the old
  `dev` / `blog-chords-version` branches (only with your OK).
- Edit the draft privacy text (`public/index.html`, `view-privacy`).
