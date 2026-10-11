# Backlog (prioritised, updated 2026-10-11)

Done since the first backlog: CMS draft switch, Apps Script in the repo
(`tools/apps-script/Code.gs`, allow-listed tabs), contact-page FAQ rendered by the worker,
every visible text editable (Site tab), RSS feed, agent files (`.md`, `llms-full.txt`),
IndexNow, related/older/newer post links.

## High — worth doing soon after launch
1. **Real share image:** a 1200×630 `og.png` (name, title, site colours) instead of the
   512×512 icon. Then set `DEFAULT_IMAGE` in `public/js/shared/render.js`.
2. **Edit the privacy text** in `public/index.html` (`view-privacy`) — or move it to the Site tab.
3. **Fix the nameserver mismatch in "Get a free domain in Nepal"** (Sheet content): the
   screenshots/text say `abby/ben.ns.cloudflare.com` placeholders but a step says to delete
   `ns1.mos.com.np`/`ns2.mos.com.np`. Make the steps and examples agree.
4. **Links from outside:** share each post once (LinkedIn, GitHub profile README, a relevant
   forum). Google discovers and prioritises pages that other sites link to; for a new site this
   matters more than any on-page change.

## Medium — performance and quality
5. **Image sizes from Google Drive:** request scaled images (Drive/lh3 URLs accept a `=w800`
   style suffix; verify first) and use `srcset` for cards and covers.
6. **Fonts:** load only the weights actually used (check `font-weight` in the CSS), or
   self-host the two main families as WOFF2.
7. **Bundle + hash CSS/JS** (esbuild as a dev dependency) for `immutable` caching and fewer
   requests. Revisit if Lighthouse flags request chains.
8. **Tests for HTMLRewriter code** (shell, pages, sanitiser) using Miniflare or
   `wrangler unstable_dev`, so they run in `npm test` too (today `npm run test:e2e` covers them
   against `dev:mock`).
9. **Small CMS clean-ups:** update the chord-era comments in `cms.js`, and check
   `cms.css` for rules no element uses any more.
10. **Last_Modified only on real edits:** the worker sets it on every blog update, even when
    nothing changed. Compare with the stored row first so the "Updated" date and sitemap
    `lastmod` stay trustworthy (Google only uses `lastmod` when it is consistently accurate).

## Low — nice to have
11. **Project detail pages** (`/projects/<slug>`) with `CreativeWork` JSON-LD, if projects grow.
12. **Instant publish:** a KV snapshot + version bump on CMS save, if "a few minutes" ever
    feels too slow.
13. **Global login rate limiting** (a free WAF rule, or Durable Objects on a paid plan).
14. **Category pages** (`/blog/category/<name>`) with their own canonical, if there are many posts.
15. **Remove leftover branches** (`dev`, `blog-chords-version`, `seo-analytics-hardening`) once
    you're sure they're not needed.
