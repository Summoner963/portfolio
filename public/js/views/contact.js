// ═══════════════════════════════════════════════════════════════════════════
//  js/views/contact.js
//
//  Exports:
//    renderContact() — activates the contact view.
//
//  The contact view is 100% static HTML already in index.html:
//    email, LinkedIn, and phone tiles inside .contact-grid.
//  There is no sheet, no fetch, no skeleton, no fallback needed.
//
//  This module's only jobs:
//    1. Lazy-load css/about.css (where .contact-grid + .contact-tile live)
//    2. Call watchReveals() so .reveal elements animate in
//
//  Open/Closed: contact details updated directly in index.html.
// ═══════════════════════════════════════════════════════════════════════════

import { loadCSS, watchReveals } from '../utils.js';

// ── Lazy CSS ───────────────────────────────────────────────────────────────
// .contact-grid and .contact-tile are defined in about.css alongside
// .about-grid, .edu-card, .timeline etc. — one file covers all three
// views (about, experience, contact). loadCSS() guards against
// double-injection so calling it from multiple modules is always safe.
const CSS_LOADED = loadCSS('/css/about.css');

/**
 * Activates the contact view.
 * Ensures about.css is loaded and triggers reveal animations.
 * No data fetching — contact details are static in index.html.
 *
 * @returns {Promise<void>}
 */
export async function renderContact() {
  await CSS_LOADED;
  watchReveals();
}