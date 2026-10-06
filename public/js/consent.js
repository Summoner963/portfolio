// js/consent.js — Google Analytics 4 with Consent Mode v2 + cookie banner.
// Classic script loaded with `defer` from <head>, so it runs before the
// router module (document order) and never blocks rendering. External file
// on purpose: the CSP allows no inline scripts.
(() => {
  'use strict';
  const GA_ID = 'G-1RWJKFPG2T';
  const KEY = 'sd_consent'; // 'granted' | 'denied'

  const read  = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = v  => { try { localStorage.setItem(KEY, v); } catch {} };

  // 1. Consent defaults BEFORE the tag loads (denied until the visitor accepts)
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
  if (read() === 'granted') gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', GA_ID, { send_page_view: false }); // the router sends page views

  // 2. Load gtag.js (allowed by the CSP: https://www.googletagmanager.com)
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  // 3. One page_view per rendered route — called by js/router.js after the
  //    view has rendered and document.title is final (including first load).
  let last = null;
  window.trackPageView = routePath => {
    const path = routePath || location.pathname + location.search;
    if (path === last) return; // same URL re-rendered: not a new page view
    last = path;
    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: location.origin + path, // clean URL (no #fragment)
      page_path: path,
    });
  };

  // 4. Cookie banner (markup lives in index.html)
  const box = document.getElementById('consent');
  if (!box) return;
  const choose = v => {
    write(v);
    gtag('consent', 'update', { analytics_storage: v });
    box.hidden = true;
  };
  document.getElementById('consentAccept')?.addEventListener('click', () => choose('granted'));
  document.getElementById('consentDeny')?.addEventListener('click', () => choose('denied'));
  // "Cookie settings" — footer button and any [data-consent-open] (privacy page)
  document.addEventListener('click', e => {
    if (!e.target.closest('#consentOpen, [data-consent-open]')) return;
    box.hidden = false;
    document.getElementById('consentAccept')?.focus();
  });
  if (!read()) box.hidden = false;
})();
