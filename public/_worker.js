// _worker.js — Cloudflare Pages entry point
//
// Cloudflare Pages runs a file named exactly "_worker.js" in the build
// output directory (public/) as the Pages Worker. The worker source lives
// in ../worker/ so it is never served as a static file; Pages bundles the
// import at deploy time — TO VERIFY against Cloudflare docs (Phase 3).
//
// We delegate 100% to worker/index.js so all logic stays in one place.
// The env.ASSETS binding (for serveIndex / serveIndexWithMeta) is
// automatically injected by Cloudflare Pages when _worker.js is present.

export { default } from "../worker/index.js";
