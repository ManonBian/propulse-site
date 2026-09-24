/* Mesure d'audience first-party de manonbian.fr.
 * Pas de cookie, pas de service tiers : un identifiant aléatoire (localStorage)
 * et un identifiant de session (sessionStorage), envoyés à /api/ev.
 * Suit : pages vues, sections vues, défilement, clics CTA, formulaire Tally
 * (ouverture → étapes → envoi), clics paiement Stripe, vidéo YouTube, FAQ.
 * Désactivation : ?notrack=1 (mémorisé), réactivation : ?notrack=0.
 */
(function () {
  'use strict';
  var ENDPOINT = '/api/ev';
  var TALLY_FORM = 'VLD9Oa';

  function store(kind) {
    try { var s = window[kind]; s.setItem('__pt', '1'); s.removeItem('__pt'); return s; } catch (e) { return null; }
  }
  var ls = store('localStorage');
  var ss = store('sessionStorage');
  function get(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(s, k, v) { try { if (s) s.setItem(k, v); } catch (e) {} }

  var qs = new URLSearchParams(location.search);
  if (qs.get('notrack') === '1') set(ls, 'pt_off', '1');
  if (qs.get('notrack') === '0') { try { ls && ls.removeItem('pt_off'); } catch (e) {} }
  var off = get(ls, 'pt_off') === '1';

  function rid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(36)).slice(-2); }).join('');
  }
  var vid = get(ls, 'pt_vid');
  if (!vid) { vid = rid(); set(ls, 'pt_vid', vid); }
  // Session : expire après 30 min d'inactivité.
  var sid = get(ss, 'pt_sid');
  var last = +get(ss, 'pt_last') || 0;
  if (!sid || Date.now() - last > 30 * 60 * 1000) { sid = rid(); set(ss, 'pt_sid', sid); set(ss, 'pt_ctx', ''); }
  set(ss, 'pt_last', String(Date.now()));

  // Contexte d'acquisition : figé au premier hit de la session.
  var ctx;
  try { ctx = JSON.parse(get(ss, 'pt_ctx') || 'null'); } catch (e) { ctx = null; }
  if (!ctx) {
    var ref = '';
    try { var r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host.replace(/^www\./, ''); } catch (e) {}
    ctx = { ref: ref, us: qs.get('utm_source') || '', um: qs.get('utm_medium') || '', uc: qs.get('utm_campaign') || '', ut: qs.get('utm_content') || '' };
    set(ss, 'pt_ctx', JSON.stringify(ctx));
  }
  var page = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '') || '/';

  var queue = [];
  var timer = null;
  function send(useBeacon) {
    timer = null;
    if (!queue.length || off) { queue = []; return; }
    var c = { path: page, ref: ctx.ref, us: ctx.us, um: ctx.um, uc: ctx.uc, ut: ctx.ut };
    var body = JSON.stringify({ v: vid, s: sid, ctx: c, ev: queue.splice(0, 40) });
    set(ss, 'pt_last', String(Date.now()));
    try {
      if (useBeacon && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }
  function track(name, props, now) {
    if (off) return;
    queue.push(props ? { n: name, p: props } : { n: name });
    if (now) send(true);
    else if (!timer) timer = setTimeout(send, 2000);
  }

  // Emplacement d'un élément : data-sec de la section parente.
  function secOf(el) {
    var s = el && el.closest && el.closest('[data-sec]');
    if (s) return s.getAttribute('data-sec');
    var sec = el && el.closest && el.closest('section,nav,footer,header');
    if (!sec) return 'page';
    return sec.id || (sec.className && String(sec.className).split(' ')[0]) || sec.tagName.toLowerCase();
  }
  function label(el) {
    return (el.getAttribute('data-cta') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  // Liens de paiement Stripe → offre (identifiant final du lien).
  var OFFERS = {
    '5kQ28t896bFI4EWgxj7ok08': 'academie_397',
    '3cI9AV3SQ4dgb3k6WJ7ok04': 'formation_497',
    '6oU4gBcpmfVYdbsch37ok03': 'accompagnement_897',
    '00w5kF3SQ8tw0oGdl77ok02': 'accompagnement_897_cache',
    'eVq4gB9daaBE3ASftf7ok01': 'accompagnement_2x497_cache',
  };

  /* ── Page vue ─────────────────────────────────────────── */
  track('pageview', { title: document.title.slice(0, 80), w: window.innerWidth }, true);
  if (qs.get('rejoindre') === 'propulse') track('secret_offer_view');

  /* ── Sections vues ────────────────────────────────────── */
  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var name = e.target.getAttribute('data-sec');
        if (seen[name]) return;
        seen[name] = 1;
        track('section_view', { sec: name });
        io.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    var observe = function () { document.querySelectorAll('[data-sec]').forEach(function (el) { io.observe(el); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe); else observe();
  }

  /* ── Défilement & temps actif ─────────────────────────── */
  var maxScroll = 0;
  var marks = [25, 50, 75, 90];
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round((window.scrollY / h) * 100)) : 100;
    if (pct > maxScroll) {
      maxScroll = pct;
      while (marks.length && pct >= marks[0]) track('scroll', { pct: marks.shift() });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var activeMs = 0;
  var lastTick = Date.now();
  var lastInput = Date.now();
  ['scroll', 'click', 'touchstart', 'keydown', 'mousemove'].forEach(function (t) {
    window.addEventListener(t, function () { lastInput = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    var now = Date.now();
    if (document.visibilityState === 'visible' && now - lastInput < 30000) activeMs += now - lastTick;
    lastTick = now;
  }, 1000);
  var left = false;
  function leave() {
    if (left) return;
    left = true;
    track('page_leave', { active_s: Math.round(activeMs / 1000), max_scroll: maxScroll });
    send(true);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') leave();
    else left = false;
  });
  window.addEventListener('pagehide', leave);

  /* ── Formulaire Tally en popup ────────────────────────── */
  var tallyLoading = null;
  function loadTally() {
    if (window.Tally) return Promise.resolve(window.Tally);
    if (tallyLoading) return tallyLoading;
    tallyLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://tally.so/widgets/embed.js';
      s.async = true;
      s.onload = function () { window.Tally ? resolve(window.Tally) : reject(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    tallyLoading.catch(function () { tallyLoading = null; });
    return tallyLoading;
  }
  // Préchargé quand le navigateur est libre : le popup s'ouvre sans attente.
  (window.requestIdleCallback || function (f) { setTimeout(f, 2500); })(function () { loadTally().catch(function () {}); });

  var hidden = function () {
    return { vid: vid, source: ctx.us || ctx.ref || 'direct', utm_campaign: ctx.uc, page: page };
  };
  function openForm(href, from) {
    track('form_open', { from: from }, true);
    var submitted = false;
    var fallback = function () {
      var u = new URL(href);
      var h = hidden();
      Object.keys(h).forEach(function (k) { if (h[k]) u.searchParams.set(k, h[k]); });
      window.open(u.toString(), '_blank') || (location.href = u.toString());
    };
    var t = setTimeout(fallback, 4000);
    loadTally().then(function (Tally) {
      clearTimeout(t);
      Tally.openPopup(TALLY_FORM, {
        layout: 'modal',
        width: 640,
        hiddenFields: hidden(),
        onPageView: function (n) { track('form_step', { step: n, from: from }); },
        onSubmit: function () { submitted = true; track('form_submit', { from: from }, true); },
        onClose: function () { track('form_close', { submitted: submitted, from: from }, true); },
      });
    }, function () { clearTimeout(t); fallback(); });
  }

  /* ── Vidéo YouTube : lecture + paliers 25/50/75/100 % ──── */
  window.PT = window.PT || {};
  window.PT.track = track;
  window.PT.watchYouTube = function (iframe, id) {
    track('video_play', { video: id }, true);
    var done = {};
    function start() {
      var player = new window.YT.Player(iframe);
      var iv = setInterval(function () {
        try {
          var d = player.getDuration(), c = player.getCurrentTime();
          if (!d) return;
          [25, 50, 75, 95].forEach(function (m) {
            if (!done[m] && c / d * 100 >= m) { done[m] = 1; track('video_progress', { video: id, pct: m === 95 ? 100 : m }); }
          });
          if (done[95]) clearInterval(iv);
        } catch (e) {}
      }, 2000);
    }
    if (window.YT && window.YT.Player) return start();
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (prev) prev(); start(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  };

  /* ── Clics ─────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a,button,.faq-q,.yt-facade');
    if (!el) return;
    var sec = secOf(el);

    if (el.classList.contains('faq-q')) {
      var h = el.querySelector('h4');
      if (!el.parentNode.classList.contains('open')) track('faq_open', { q: (h ? h.textContent : '').trim().slice(0, 80) });
      return;
    }
    if (el.classList.contains('theme-btn')) {
      if (!el.classList.contains('open')) track('theme_open', { theme: label(el.querySelector('.theme-name') || el) });
      return;
    }
    if (el.tagName !== 'A') return;
    var href = el.getAttribute('href') || '';

    if (/^https:\/\/tally\.so\//.test(href)) {
      track('cta_click', { cta: label(el), sec: sec, to: 'form' });
      if (e.metaKey || e.ctrlKey || e.shiftKey || off) return;
      e.preventDefault();
      openForm(href, sec);
    } else if (/^https:\/\/buy\.stripe\.com\//.test(href)) {
      var linkId = href.split('/').pop().split('?')[0];
      track('checkout_click', { offer: OFFERS[linkId] || linkId, sec: sec }, true);
      // Rattache le paiement au visiteur (repris par le webhook Stripe).
      try {
        var u = new URL(el.href);
        u.searchParams.set('client_reference_id', vid);
        el.href = u.toString();
      } catch (err) {}
    } else if (/^https:\/\/wa\.me\//.test(href)) {
      track('whatsapp_click', { cta: label(el), sec: sec }, true);
    } else if (/instagram\.com|tiktok\.com|youtube\.com/.test(href)) {
      track('social_click', { net: href.replace(/^https?:\/\/(www\.)?/, '').split('.')[0], sec: sec }, true);
    } else if (href.charAt(0) === '#' && href.length > 1) {
      track('cta_click', { cta: label(el), sec: sec, to: href.slice(1) });
    }
  }, true);
})();
