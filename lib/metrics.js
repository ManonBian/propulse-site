// Requêtes du tableau de bord. Volumes faibles (site vitrine) : on agrège
// en SQL ce qui est simple et on croise en JS (attribution, entonnoir).

const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const one = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {};

export async function loadMetrics(db, from, to) {
  const R = [from, to];
  const range = 'day BETWEEN ? AND ?';

  const [totals, perVid, firstTouchAll, daily, devices, countries, pages, refs, sections, scrolls,
    ctas, offers, formSteps, videos, faqs, themes, leave, leads, orders, dailyOrders] = await Promise.all([
    one(db, `SELECT COUNT(DISTINCT vid) visitors, COUNT(DISTINCT sid) sessions, SUM(event='pageview') pageviews FROM events WHERE ${range}`, ...R),
    // Drapeaux par visiteur sur la période.
    all(db, `SELECT vid,
        MAX(event='section_view' AND json_extract(props,'$.sec')='offres'
            OR event='pageview' AND path IN ('/offres','/rejoindre')
            OR event='secret_offer_view') saw_offers,
        MAX(event='cta_click' AND json_extract(props,'$.to')='form'
            OR event IN ('checkout_click','whatsapp_click','form_open')) intent,
        MAX(event='form_open') form_open,
        MAX(event='form_submit') form_submit,
        MAX(event='checkout_click') checkout,
        MAX(event='whatsapp_click') whatsapp
      FROM events WHERE ${range} GROUP BY vid`, ...R),
    // Premier contact de chaque visiteur (toutes dates) : sert à l'attribution.
    all(db, `SELECT vid, source, campaign FROM (
        SELECT vid, source, campaign, ROW_NUMBER() OVER (PARTITION BY vid ORDER BY ts) rn FROM events WHERE event='pageview'
      ) WHERE rn = 1`),
    all(db, `SELECT day, COUNT(DISTINCT vid) visitors, COUNT(DISTINCT CASE WHEN event='form_submit' THEN vid END) forms,
        COUNT(DISTINCT CASE WHEN event='checkout_click' THEN vid END) checkouts
      FROM events WHERE ${range} GROUP BY day ORDER BY day`, ...R),
    all(db, `SELECT device k, COUNT(DISTINCT vid) n FROM events WHERE ${range} GROUP BY device ORDER BY n DESC`, ...R),
    all(db, `SELECT COALESCE(country,'?') k, COUNT(DISTINCT vid) n FROM events WHERE ${range} GROUP BY k ORDER BY n DESC LIMIT 8`, ...R),
    all(db, `SELECT path k, COUNT(*) n, COUNT(DISTINCT vid) u FROM events WHERE ${range} AND event='pageview' GROUP BY path ORDER BY n DESC LIMIT 10`, ...R),
    all(db, `SELECT COALESCE(ref_host,'(aucun)') k, COUNT(DISTINCT vid) n FROM events WHERE ${range} AND event='pageview' GROUP BY k ORDER BY n DESC LIMIT 10`, ...R),
    all(db, `SELECT json_extract(props,'$.sec') k, COUNT(DISTINCT vid) n FROM events WHERE ${range} AND event='section_view' AND path='/' GROUP BY k`, ...R),
    all(db, `SELECT json_extract(props,'$.pct') k, COUNT(DISTINCT vid) n FROM events WHERE ${range} AND event='scroll' AND path='/' GROUP BY k`, ...R),
    all(db, `SELECT event e, json_extract(props,'$.sec') sec, json_extract(props,'$.cta') cta, COUNT(*) n, COUNT(DISTINCT vid) u
      FROM events WHERE ${range} AND event IN ('cta_click','whatsapp_click','social_click') GROUP BY e, sec, cta ORDER BY n DESC LIMIT 25`, ...R),
    all(db, `SELECT json_extract(props,'$.offer') k, COUNT(*) n, COUNT(DISTINCT vid) u FROM events WHERE ${range} AND event='checkout_click' GROUP BY k ORDER BY n DESC`, ...R),
    all(db, `SELECT event e, json_extract(props,'$.step') step, COUNT(DISTINCT sid) n FROM events
      WHERE ${range} AND event IN ('form_open','form_step','form_submit') GROUP BY e, step`, ...R),
    all(db, `SELECT event e, json_extract(props,'$.pct') pct, COUNT(DISTINCT vid) n FROM events
      WHERE ${range} AND event IN ('video_play','video_progress') GROUP BY e, pct`, ...R),
    all(db, `SELECT json_extract(props,'$.q') k, COUNT(DISTINCT vid) n FROM events WHERE ${range} AND event='faq_open' GROUP BY k ORDER BY n DESC`, ...R),
    all(db, `SELECT json_extract(props,'$.theme') k, COUNT(DISTINCT vid) n FROM events WHERE ${range} AND event='theme_open' GROUP BY k ORDER BY n DESC`, ...R),
    all(db, `SELECT path, json_extract(props,'$.active_s') s FROM events WHERE ${range} AND event='page_leave'`, ...R),
    all(db, `SELECT ts, day, email, name, phone, vid, source, campaign FROM leads WHERE ${range} ORDER BY ts DESC`, ...R),
    all(db, `SELECT ts, day, status, amount, refunded, currency, email, vid, payment_link FROM orders WHERE ${range} ORDER BY ts DESC`, ...R),
    all(db, `SELECT day, SUM(status='paid') sales, SUM(CASE WHEN status='paid' THEN amount-refunded ELSE 0 END) revenue FROM orders WHERE ${range} GROUP BY day`, ...R),
  ]);

  // ── Attribution ────────────────────────────────────────────
  const ft = new Map(firstTouchAll.map((r) => [r.vid, r]));
  const leadByEmail = new Map();
  for (const l of await all(db, `SELECT email, vid, source FROM leads WHERE email IS NOT NULL ORDER BY ts`)) {
    if (!leadByEmail.has(l.email)) leadByEmail.set(l.email, l);
  }
  const sourceOfVid = (vid) => (vid && ft.get(vid)?.source) || null;
  const attribute = (vid, email) => {
    const s = sourceOfVid(vid);
    if (s) return s;
    const lead = email && leadByEmail.get(email);
    return (lead && (sourceOfVid(lead.vid) || lead.source)) || 'inconnue';
  };
  const buyers = new Set(); // emails ayant payé (toutes dates) pour marquer les leads convertis
  for (const o of await all(db, `SELECT email FROM orders WHERE status='paid' AND email IS NOT NULL`)) buyers.add(o.email);

  for (const l of leads) { l.src = attribute(l.vid, l.email); l.bought = !!(l.email && buyers.has(l.email)); }
  for (const o of orders) o.src = attribute(o.vid, o.email);
  const paid = orders.filter((o) => o.status === 'paid');

  // ── Entonnoir ──────────────────────────────────────────────
  const count = (k) => perVid.filter((r) => r[k]).length;
  const funnel = [
    { k: 'Visiteurs', n: perVid.length },
    { k: 'Ont vu les offres', n: count('saw_offers') },
    { k: 'Clic vers formulaire / paiement', n: count('intent') },
    { k: 'Formulaire ouvert', n: count('form_open') },
    { k: 'Formulaire envoyé', n: count('form_submit') },
    { k: 'Clic paiement Stripe', n: count('checkout') },
    { k: 'Achat', n: paid.length },
  ];

  // ── Par source ─────────────────────────────────────────────
  const bySrc = new Map();
  const row = (s) => {
    if (!bySrc.has(s)) bySrc.set(s, { src: s, visitors: 0, forms: 0, leads: 0, checkouts: 0, sales: 0, revenue: 0 });
    return bySrc.get(s);
  };
  for (const r of perVid) {
    const x = row(sourceOfVid(r.vid) || 'inconnue');
    x.visitors++;
    if (r.form_submit) x.forms++;
    if (r.checkout) x.checkouts++;
  }
  for (const l of leads) row(l.src).leads++;
  for (const o of paid) { const x = row(o.src); x.sales++; x.revenue += (o.amount || 0) - (o.refunded || 0); }
  const sources = [...bySrc.values()].sort((a, b) => b.visitors - a.visitors || b.revenue - a.revenue);

  // ── Temps actif médian ─────────────────────────────────────
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const activeHome = median(leave.filter((r) => r.path === '/' && r.s != null).map((r) => Number(r.s)));

  const revenue = paid.reduce((s, o) => s + (o.amount || 0) - (o.refunded || 0), 0);
  const refundedAmt = orders.reduce((s, o) => s + (o.refunded || 0), 0);

  return {
    totals: { ...totals, leads: leads.length, sales: paid.length, revenue, refunded: refundedAmt,
      expired: orders.filter((o) => o.status === 'expired').length, activeHome,
      aov: paid.length ? revenue / paid.length : null },
    funnel, sources, daily, dailyOrders, devices, countries, pages, refs, sections, scrolls, ctas, offers,
    formSteps, videos, faqs, themes, leads, orders,
  };
}
