// POST /api/ev — ingestion des événements du navigateur (sendBeacon / fetch keepalive).
// Répond toujours 204 : le tracking ne doit jamais casser la page.

import { parisDay, clip, deviceOf, channelOf, BOT_RE } from '../../lib/util.js';

export const EVENTS = new Set([
  'pageview', 'section_view', 'scroll', 'page_leave',
  'cta_click', 'checkout_click', 'whatsapp_click', 'social_click',
  'form_open', 'form_step', 'form_submit', 'form_close',
  'video_play', 'video_progress', 'faq_open', 'theme_open', 'secret_offer_view',
]);

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const MAX_BODY = 16_000;
const MAX_EVENTS = 40;

const noContent = () => new Response(null, { status: 204 });

export async function onRequestPost({ request, env }) {
  try {
    const ua = request.headers.get('user-agent') || '';
    if (BOT_RE.test(ua)) return noContent();
    // Visites de Manon (cookie posé par /admin) : ignorées.
    if (/(?:^|;\s*)pt_ignore=1/.test(request.headers.get('cookie') || '')) return noContent();

    const raw = await request.text();
    if (raw.length > MAX_BODY) return noContent();
    const body = JSON.parse(raw);
    const { v: vid, s: sid, ctx = {}, ev } = body || {};
    if (!ID_RE.test(vid || '') || !ID_RE.test(sid || '') || !Array.isArray(ev)) return noContent();

    const now = Date.now();
    const day = parisDay(now);
    const refHost = clip(ctx.ref, 100);
    const utmSource = clip(ctx.us, 100);
    const source = channelOf(utmSource, ua, refHost);
    const medium = clip(ctx.um, 100);
    const campaign = clip(ctx.uc, 100);
    const content = clip(ctx.ut, 100);
    const country = clip(request.cf?.country, 2);
    const device = deviceOf(ua);

    const stmt = env.DB.prepare(
      `INSERT INTO events (ts, day, event, vid, sid, path, source, medium, campaign, content, ref_host, country, device, props)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const rows = [];
    for (const e of ev.slice(0, MAX_EVENTS)) {
      if (!e || !EVENTS.has(e.n)) continue;
      let props = null;
      if (e.p && typeof e.p === 'object') {
        const s = JSON.stringify(e.p);
        if (s.length <= 600) props = s;
      }
      rows.push(stmt.bind(now, day, e.n, vid, sid, clip(e.path ?? ctx.path, 200), source, medium, campaign, content, refHost, country, device, props));
    }
    if (rows.length) await env.DB.batch(rows);
  } catch (err) {
    console.error('ev ingest', err);
  }
  return noContent();
}
