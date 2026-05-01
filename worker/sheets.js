// worker/sheets.js
// ═══════════════════════════════════════════════════════════════════════════
//  SINGLE SOURCE OF TRUTH for all Google Sheet GIDs.
//
//  Security model:
//   - GIDs live here (server-side only) — never sent to the browser.
//   - SHEET_ID is a Cloudflare secret (set via dashboard / wrangler secret put).
//   - Adding a new section = one new line here + one line in worker/index.js
//     + one var in wrangler.toml. Zero changes to any other file.
//
//  To find a GID: open the Sheet tab → URL shows ?gid=XXXXXXXXX
//  To add a tab:  add one entry below, add the env var to wrangler.toml,
//                 then register the route in worker/index.js.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns a map of logical sheet names → GIDs.
 * All values come from Cloudflare env vars (wrangler.toml [vars]).
 * Hard-coded fallbacks are used only in local `wrangler dev` without a .dev.vars file.
 *
 * @param {object} env  — Cloudflare Worker env bindings
 * @returns {Record<string, string>}
 */
export function getSheetGids(env) {
  return {
    // ── Existing sheets ────────────────────────────────────────────────
    blog:     env.BLOG_GID     || '1132024800',
    skills:   env.SKILLS_GID   || '302402061',
    projects: env.PROJECTS_GID || '0',
    exp:      env.EXP_GID      || '245982630',
    about:    env.ABOUT_GID    || '1066410604',
    faq:      env.FAQ_GID      || '303688554',
    images:   env.IMAGES_GID   || '1267436347',
    featured: env.FEATURED_GID || '980532084',

    // ── Chords sheet (NEW) ─────────────────────────────────────────────
    // Set CHORDS_GID in wrangler.toml [vars] once the sheet tab is created.
    // Until then this returns '' which causes /api/data?sheet=chords → 404.
    chords:   env.CHORDS_GID   || '',
  };
}

/**
 * Whitelist of all valid sheet names accepted by /api/data?sheet=<name>.
 * Any name NOT in this set is rejected with 404 — no arbitrary proxying.
 * Derived from getSheetGids() so it stays in sync automatically.
 *
 * @param {object} env
 * @returns {Set<string>}
 */
export function getAllowedSheetNames(env) {
  return new Set(Object.keys(getSheetGids(env)));
}