# Backlog (prioritised)

## High — worth doing soon after launch
1. **Draft switch in the CMS.** The worker already hides rows with a `Status` of draft and
   already accepts `Status` on CMS saves; only the editor's Published/Draft toggle is missing.
2. **Review the Apps Script** (`doPost`): it should reject a wrong secret, allow-list its tabs,
   and use `setValues` safely. Keep a copy in the repo (without the secret).
3. **Real share image:** a 1200×630 `og.png` (name, title, site colours) instead of the
   512×512 icon. Then set `DEFAULT_IMAGE` in `public/js/shared/render.js`.
4. **Edit the privacy text** in `public/index.html` (`view-privacy`).

## Medium — performance and quality
5. **Image sizes from Google Drive:** request scaled images (Drive/lh3 URLs accept a `=w800`
   style suffix; verify first) and use `srcset` for cards and covers.
6. **Fonts:** load only the weights actually used (check `font-weight` in the CSS), or
   self-host the two main families as WOFF2.
7. **Bundle + hash CSS/JS** (esbuild as a dev dependency) for `immutable` caching and fewer
   requests. Revisit if Lighthouse flags request chains.
8. **SSR the contact-page FAQ** (`faq` rows with `Blog_Slug = contact`) like blog FAQs.
9. **Tests for HTMLRewriter code** (shell, pages, sanitiser) using Miniflare or
   `wrangler unstable_dev`, so they run in `npm test` too.
10. **Small CMS clean-ups:** update the chord-era comments in `cms.js`, and check
    `cms.css` for rules no element uses any more.

## Low — nice to have
11. **Project detail pages** (`/projects/<slug>`) with `CreativeWork` JSON-LD, if projects grow.
12. **Instant publish (Phase 3 option B):** a KV snapshot + version bump on CMS save, if
    "a few minutes" ever feels too slow.
13. **Global login rate limiting** (a free WAF rule, or Durable Objects on a paid plan).
14. **Category pages** (`/blog/category/<name>`) with their own canonical, if there are many posts.
15. **RSS/Atom feed** at `/feed.xml`, generated like the sitemap.
16. **Remove leftover branches** (`dev`, `blog-chords-version`, `seo-analytics-hardening`) once
    you're sure they're not needed.
