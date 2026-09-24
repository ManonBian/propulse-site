// POST /api/stripe — webhook Stripe (signature vérifiée).
// Événements à abonner : checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.expired, charge.refunded, invoice.paid.
// client_reference_id = identifiant visiteur ajouté par site.js sur les liens buy.stripe.com.

import { parisDay, hmacBytes, toHex, safeEqual, json } from '../../lib/util.js';

const TOLERANCE_S = 300;
const VID_RE = /^[A-Za-z0-9_-]{8,40}$/;

async function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((p) => p.length === 2 && p[0] === 't'));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const expected = toHex(await hmacBytes(secret, `${t}.${raw}`));
  return sigs.some((s) => safeEqual(s, expected));
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await verify(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'bad signature' }, 400);
  }
  const evt = JSON.parse(raw);
  const obj = evt.data?.object || {};
  const now = Date.now();

  if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded' || evt.type === 'checkout.session.expired') {
    let status = 'expired';
    if (evt.type !== 'checkout.session.expired') {
      // Paiement différé (virement…) : attendre async_payment_succeeded.
      if (obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return json({ ok: true, skipped: 'unpaid' });
      status = 'paid';
    }
    const ts = (obj.created ? obj.created * 1000 : now);
    const vid = VID_RE.test(obj.client_reference_id || '') ? obj.client_reference_id : null;
    const email = (obj.customer_details?.email || obj.customer_email || '').toLowerCase() || null;
    await env.DB.prepare(
      `INSERT INTO orders (ts, day, session_id, payment_intent, status, amount, currency, email, vid, payment_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         status = CASE WHEN orders.status = 'refunded' THEN orders.status ELSE excluded.status END,
         payment_intent = COALESCE(excluded.payment_intent, orders.payment_intent),
         email = COALESCE(excluded.email, orders.email),
         amount = excluded.amount`,
    ).bind(
      status === 'paid' ? now : ts, parisDay(status === 'paid' ? now : ts), obj.id,
      typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
      status, obj.amount_total ?? null, obj.currency ?? null, email, vid,
      typeof obj.payment_link === 'string' ? obj.payment_link : null,
    ).run();
  } else if (evt.type === 'invoice.paid') {
    // Mensualités suivantes des paiements en plusieurs fois (la 1re arrive via checkout.session.completed).
    if (obj.billing_reason !== 'subscription_cycle' || !obj.amount_paid) return json({ ok: true, skipped: obj.billing_reason });
    const email = (obj.customer_email || '').toLowerCase() || null;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO orders (ts, day, session_id, payment_intent, status, amount, currency, email, vid, payment_link)
       VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, NULL, NULL)`,
    ).bind(now, parisDay(now), obj.id, typeof obj.payment_intent === 'string' ? obj.payment_intent : null,
      obj.amount_paid, obj.currency ?? null, email).run();
  } else if (evt.type === 'charge.refunded') {
    if (typeof obj.payment_intent === 'string') {
      await env.DB.prepare(
        `UPDATE orders SET refunded = ?, status = CASE WHEN ? >= amount THEN 'refunded' ELSE status END WHERE payment_intent = ?`,
      ).bind(obj.amount_refunded || 0, obj.amount_refunded || 0, obj.payment_intent).run();
    }
  }
  return json({ ok: true });
}
