// POST /api/tally — webhook Tally (signature « Tally-Signature » vérifiée).
// Le formulaire doit déclarer les champs cachés : vid, source, utm_campaign
// (remplis par site.js à l'ouverture du popup).

import { parisDay, clip, hmacBytes, toBase64, safeEqual, json } from '../../lib/util.js';

const VID_RE = /^[A-Za-z0-9_-]{8,40}$/;

function pick(fields, test) {
  const f = fields.find(test);
  if (!f) return null;
  return Array.isArray(f.value) ? f.value.join(', ') : f.value;
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const sig = request.headers.get('tally-signature');
  if (!env.TALLY_SIGNING_SECRET || !sig || !safeEqual(sig, toBase64(await hmacBytes(env.TALLY_SIGNING_SECRET, raw)))) {
    return json({ error: 'bad signature' }, 400);
  }
  const evt = JSON.parse(raw);
  if (evt.eventType !== 'FORM_RESPONSE') return json({ ok: true });
  const data = evt.data || {};
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const hidden = (label) => pick(fields, (f) => f.type === 'HIDDEN_FIELDS' && f.label === label);

  const email = pick(fields, (f) => f.type === 'INPUT_EMAIL');
  // Le formulaire demande le WhatsApp dans un champ texte libre.
  const phone = pick(fields, (f) => f.type === 'INPUT_PHONE_NUMBER')
    || pick(fields, (f) => f.type === 'INPUT_TEXT' && /whats|t[ée]l[ée]phone|num[ée]ro/i.test(f.label || ''));
  const name = pick(fields, (f) => f.type === 'INPUT_TEXT' && /pr[ée]nom|\bnom\b|name/i.test(f.label || ''));
  const vid = hidden('vid');
  const ts = Date.parse(data.createdAt || evt.createdAt) || Date.now();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO leads (ts, day, submission_id, email, name, phone, vid, source, campaign)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    ts, parisDay(ts), clip(data.submissionId || data.responseId || evt.eventId, 80),
    email ? clip(email, 200).toLowerCase() : null, clip(name, 120), clip(phone, 40),
    VID_RE.test(vid || '') ? vid : null, clip(hidden('source'), 100), clip(hidden('utm_campaign'), 100),
  ).run();
  return json({ ok: true });
}
