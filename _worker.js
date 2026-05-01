// _worker.js — Cloudflare Pages entry point
//
// Cloudflare Pages automatically executes a file named exactly
// "_worker.js" at the project root as the Pages Worker.
//
// We delegate 100% to worker/index.js so all logic stays in one place.
// The env.ASSETS binding (for serveIndex / serveIndexWithMeta) is
// automatically injected by Cloudflare Pages when _worker.js is present.

export { default } from "./worker/index.js";
