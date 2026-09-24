// /admin — tableau de bord (mot de passe : secret ADMIN_PASSWORD).

import { isAuthed, passwordOk, sessionCookie, logoutCookie } from '../../lib/auth.js';
import { loadMetrics } from '../../lib/metrics.js';
import { parisDay } from '../../lib/util.js';

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('fr-FR');
const n = (v) => (v == null ? '—' : nf.format(v));
const eur = (cents) => (cents == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100));
const pct = (a, b) => (b ? `${((a / b) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—');
const dt = (ms) => new Date(ms).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const OFFER_LABELS = {
  academie_397: 'Académie 397 €', formation_497: 'Formation 497 € (page offres)', accompagnement_897: 'Accompagnement 897 €',
  accompagnement_897_cache: 'Accompagnement 897 € (section cachée)', accompagnement_2x497_cache: 'Accompagnement 2×497 € (section cachée)',
};

const SECTIONS = [
  ['hero', 'Haut de page'], ['video', 'Vidéo'], ['probleme', 'Tu te reconnais ?'], ['academie', 'Académie'],
  ['academie_demo', 'Démo plateforme'], ['about', 'À propos'], ['realisations', 'Réalisations'],
  ['virements', 'Virements'], ['offres', 'Offres'], ['temoignages', 'Témoignages'], ['faq', 'FAQ'], ['footer', 'Pied de page'],
];

async function page(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>
:root{--bg:#FAF7F2;--card:#fff;--ink:#2C1810;--ink2:#6b5347;--muted:#9a8579;--line:#EDE4DD;--mark:#B86F6F;--mark-wash:rgba(184,111,111,.12);--ok:#2f7d4f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17120f;--card:#221b17;--ink:#F3ECE6;--ink2:#c9b8ad;--muted:#94827a;--line:#3a2f29;--mark:#D89A9A;--mark-wash:rgba(216,154,154,.14);--ok:#6cc690}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 Inter,system-ui,-apple-system,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:20px 16px 60px}
h1{font:700 1.35rem/1.2 Georgia,serif;margin:0}h2{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);margin:0 0 12px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}
.filters{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.filters a,.filters button{border:1px solid var(--line);background:var(--card);color:var(--ink);padding:6px 11px;border-radius:999px;text-decoration:none;font:inherit;cursor:pointer}
.filters a.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.filters input{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:5px 6px;font:inherit}
.grid{display:grid;gap:14px}.kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.two{grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
.kpi .v{font:700 1.7rem/1.1 Georgia,serif;margin-top:4px}.kpi .l{color:var(--ink2);font-size:.8rem}.kpi .s{color:var(--muted);font-size:.75rem;margin-top:3px}
section{margin-top:14px}
table{width:100%;border-collapse:collapse;font-size:.85rem}th{text-align:left;color:var(--muted);font-weight:500;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.scroll{overflow-x:auto}
.bar{display:grid;grid-template-columns:minmax(120px,210px) 1fr 110px;gap:10px;align-items:center;padding:5px 0}
.bar .t{height:18px;background:var(--mark-wash);border-radius:0 4px 4px 0;position:relative}
.bar .t i{position:absolute;inset:0 auto 0 0;background:var(--mark);border-radius:0 4px 4px 0;max-width:100%}
.bar .k{color:var(--ink2);font-size:.85rem}
@media(max-width:560px){.bar{grid-template-columns:1fr auto;row-gap:4px}.bar .t{grid-column:1/-1;order:3}}.bar .n{text-align:right;font-variant-numeric:tabular-nums}.bar .n small{color:var(--muted)}
.muted{color:var(--muted)}.ok{color:var(--ok);font-weight:600}
svg text{fill:var(--muted);font-size:10px}
.empty{color:var(--muted);padding:8px 0}
.login{max-width:340px;margin:12vh auto;padding:0 16px}.login input{width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;margin:10px 0}
.login button{width:100%;padding:11px;border:0;border-radius:10px;background:var(--ink);color:var(--bg);font:600 14px Inter,sans-serif;cursor:pointer}
.err{color:#b3261e;font-size:.85rem}
</style></head><body>${body}</body></html>`;
}

function loginPage(error) {
  return page('Connexion', `<form class="login" method="post" action="/admin/login">
<h1>PROPULSE · Stats</h1>
<input type="password" name="password" placeholder="Mot de passe" autocomplete="current-password" autofocus required>
${error ? '<p class="err">Mot de passe incorrect.</p>' : ''}
<button>Se connecter</button></form>`);
}

// Barres horizontales (une seule série : pas de légende, titre de la carte = mesure).
function bars(rows, { total, fmt = n } = {}) {
  if (!rows.length) return '<p class="empty">Pas encore de données.</p>';
  const max = Math.max(...rows.map((r) => r.n), 1);
  return rows.map((r) => `<div class="bar" title="${esc(r.k)} : ${esc(fmt(r.n))}"><span class="k">${esc(r.k)}</span>
<span class="t"><i style="width:${((r.n / max) * 100).toFixed(1)}%"></i></span>
<span class="n">${esc(fmt(r.n))}${total ? ` <small>${pct(r.n, total)}</small>` : ''}</span></div>`).join('');
}

// Colonnes journalières (une seule série) avec info-bulle par colonne.
function columns(days, values, fmt = n) {
  if (!days.length) return '<p class="empty">Pas encore de données.</p>';
  const W = 640, H = 150, pad = 22, max = Math.max(...values, 1);
  const bw = (W - pad) / days.length, w = Math.max(2, Math.min(24, bw - 2));
  const cols = days.map((d, i) => {
    const h = (values[i] / max) * (H - 30);
    const x = pad + i * bw + (bw - w) / 2, y = H - 16 - h;
    const r = Math.min(4, w / 2, h);
    const path = h > 0 ? `M${x},${H - 16}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H - 16}Z` : '';
    return `<g><title>${esc(d)} : ${esc(fmt(values[i]))}</title><rect x="${pad + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${path ? `<path d="${path}" fill="var(--mark)"/>` : ''}</g>`;
  }).join('');
  const lbl = (i) => `<text x="${pad + i * bw + bw / 2}" y="${H - 3}" text-anchor="middle">${esc(days[i].slice(5).split('-').reverse().join('/'))}</text>`;
  const ticks = days.length > 1 ? lbl(0) + lbl(days.length - 1) : lbl(0);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Évolution journalière">
<line x1="${pad}" x2="${W}" y1="${H - 16}" y2="${H - 16}" stroke="var(--line)"/>
<text x="0" y="12">${esc(fmt(max))}</text><line x1="${pad}" x2="${W}" y1="14" y2="14" stroke="var(--line)"/>${cols}${ticks}</svg>`;
}

function rangeOf(url) {
  const today = parisDay(Date.now());
  const r = url.searchParams.get('r') || '30';
  if (r === 'custom') {
    const f = url.searchParams.get('from'), t = url.searchParams.get('to');
    if (/^\d{4}-\d{2}-\d{2}$/.test(f || '') && /^\d{4}-\d{2}-\d{2}$/.test(t || '')) return { r, from: f, to: t };
  }
  if (r === 'today') return { r, from: today, to: today };
  const days = { 7: 7, 30: 30, 90: 90, 365: 365 }[r] || 30;
  return { r: String(days), from: parisDay(Date.now() - (days - 1) * 86400000), to: today };
}

function eachDay(from, to) {
  const out = [];
  for (let d = new Date(`${from}T12:00:00Z`); ; d = new Date(d.getTime() + 86400000)) {
    const s = d.toISOString().slice(0, 10);
    if (s > to || out.length > 400) break;
    out.push(s);
  }
  return out;
}

async function dashboard(env, url) {
  const { r, from, to } = rangeOf(url);
  const m = await loadMetrics(env.DB, from, to);
  const t = m.totals;
  const days = eachDay(from, to);
  const byDay = (arr, key) => { const mp = new Map(arr.map((x) => [x.day, x[key] || 0])); return days.map((d) => mp.get(d) || 0); };
  const visitors = t.visitors || 0;

  const chip = (k, lbl) => `<a class="${r === k ? 'on' : ''}" href="?r=${k}">${lbl}</a>`;
  const homeVisitors = (m.pages.find((p) => p.k === '/') || {}).u || 0;
  const secMap = new Map(m.sections.map((s) => [s.k, s.n]));
  const formOpens = (m.formSteps.find((s) => s.e === 'form_open') || {}).n || 0;
  const formSubmits = (m.formSteps.find((s) => s.e === 'form_submit') || {}).n || 0;
  const steps = m.formSteps.filter((s) => s.e === 'form_step').sort((a, b) => a.step - b.step);
  const vPlay = (m.videos.find((v) => v.e === 'video_play') || {}).n || 0;
  const vProg = (p) => (m.videos.find((v) => v.e === 'video_progress' && Number(v.pct) === p) || {}).n || 0;
  const scrollAt = (p) => (m.scrolls.find((s) => Number(s.k) === p) || {}).n || 0;
  const label = { cta_click: 'Bouton', whatsapp_click: 'WhatsApp', social_click: 'Réseau social' };

  const body = `<div class="wrap">
<header><h1>PROPULSE · Stats</h1>
<form class="filters" method="get">${chip('today', "Aujourd'hui")}${chip('7', '7 j')}${chip('30', '30 j')}${chip('90', '90 j')}${chip('365', '1 an')}
<input type="hidden" name="r" value="custom"><input type="date" name="from" value="${from}" aria-label="Du"><input type="date" name="to" value="${to}" aria-label="Au"><button>OK</button>
<a href="/admin/logout">Déconnexion</a></form></header>

<div class="grid kpis">
<div class="card kpi"><div class="l">Visiteurs uniques</div><div class="v">${n(visitors)}</div><div class="s">${n(t.sessions)} sessions · ${n(t.pageviews)} pages vues</div></div>
<div class="card kpi"><div class="l">Formulaires reçus</div><div class="v">${n(t.leads)}</div><div class="s">${pct(t.leads, visitors)} des visiteurs</div></div>
<div class="card kpi"><div class="l">Ventes</div><div class="v">${n(t.sales)}</div><div class="s">${pct(t.sales, visitors)} des visiteurs</div></div>
<div class="card kpi"><div class="l">Chiffre d'affaires</div><div class="v">${eur(t.revenue)}</div><div class="s">Panier moyen ${eur(t.aov)}${t.refunded ? ` · remboursé ${eur(t.refunded)}` : ''}</div></div>
<div class="card kpi"><div class="l">Paiements abandonnés</div><div class="v">${n(t.expired)}</div><div class="s">Page Stripe ouverte, pas payée</div></div>
<div class="card kpi"><div class="l">Temps actif médian</div><div class="v">${t.activeHome == null ? '—' : `${Math.floor(t.activeHome / 60)} min ${String(t.activeHome % 60).padStart(2, '0')}`}</div><div class="s">Sur la page d'accueil</div></div>
</div>

<section class="card"><h2>Entonnoir (visiteurs uniques)</h2>
${bars(m.funnel.map((f) => ({ k: f.k, n: f.n })), { total: m.funnel[0].n })}
<p class="muted" style="margin:8px 0 0;font-size:.78rem">« Achat » compte tous les paiements Stripe de la période, y compris ceux faits via un lien envoyé sur WhatsApp.</p></section>

<section class="card"><h2>Par source (premier contact)</h2><div class="scroll"><table>
<tr><th>Source</th><th class="r">Visiteurs</th><th class="r">Formulaires</th><th class="r">Conv.</th><th class="r">Clics paiement</th><th class="r">Ventes</th><th class="r">CA</th></tr>
${m.sources.map((s) => `<tr><td>${esc(s.src)}</td><td class="r">${n(s.visitors)}</td><td class="r">${n(s.leads)}</td><td class="r">${pct(s.leads, s.visitors)}</td><td class="r">${n(s.checkouts)}</td><td class="r">${n(s.sales)}</td><td class="r">${eur(s.revenue)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Pas encore de données.</td></tr>'}
</table></div><p class="muted" style="margin:8px 0 0;font-size:.78rem">Source = paramètre utm_source du lien, sinon l'app (navigateur Instagram/TikTok), sinon le site d'origine. Astuce : lien en bio Instagram <code>manonbian.fr/?utm_source=instagram&amp;utm_medium=bio</code>.</p></section>

<div class="grid two">
<section class="card"><h2>Visiteurs par jour</h2>${columns(days, byDay(m.daily, 'visitors'))}</section>
<section class="card"><h2>Formulaires envoyés par jour</h2>${columns(days, byDay(m.daily, 'forms'))}</section>
<section class="card"><h2>Ventes par jour</h2>${columns(days, byDay(m.dailyOrders, 'sales'))}</section>
<section class="card"><h2>Chiffre d'affaires par jour</h2>${columns(days, byDay(m.dailyOrders, 'revenue'), eur)}</section>
</div>

<div class="grid two">
<section class="card"><h2>Sections vues (page d'accueil)</h2>
${bars(SECTIONS.map(([k, l]) => ({ k: l, n: secMap.get(k) || 0 })).filter((x, i) => x.n || i < 11), { total: homeVisitors })}</section>
<section class="card"><h2>Défilement de la page d'accueil</h2>
${bars([25, 50, 75, 90].map((p) => ({ k: `${p} % de la page`, n: scrollAt(p) })), { total: homeVisitors })}
<h2 style="margin-top:18px">Vidéo YouTube</h2>
${bars([{ k: 'Lancée', n: vPlay }, ...[25, 50, 75, 100].map((p) => ({ k: `Vue à ${p} %`, n: vProg(p) }))], { total: homeVisitors })}</section>
</div>

<div class="grid two">
<section class="card"><h2>Formulaire Tally (sessions)</h2>
${bars([{ k: 'Ouvert', n: formOpens }, ...steps.map((s) => ({ k: `Étape ${s.step}`, n: s.n })), { k: 'Envoyé', n: formSubmits }], { total: formOpens })}</section>
<section class="card"><h2>Clics paiement par offre</h2>
${bars(m.offers.map((o) => ({ k: OFFER_LABELS[o.k] || o.k, n: o.u })))}
<h2 style="margin-top:18px">Appareils</h2>${bars(m.devices.map((d) => ({ k: d.k, n: d.n })), { total: visitors })}</section>
</div>

<section class="card"><h2>Clics sur les boutons</h2><div class="scroll"><table>
<tr><th>Type</th><th>Section</th><th>Bouton</th><th class="r">Clics</th><th class="r">Visiteurs</th></tr>
${m.ctas.map((c) => `<tr><td>${esc(label[c.e] || c.e)}</td><td>${esc(c.sec)}</td><td>${esc(c.cta || '')}</td><td class="r">${n(c.n)}</td><td class="r">${n(c.u)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Pas encore de données.</td></tr>'}
</table></div></section>

<div class="grid two">
<section class="card"><h2>Pages</h2><table><tr><th>Page</th><th class="r">Vues</th><th class="r">Visiteurs</th></tr>
${m.pages.map((p) => `<tr><td>${esc(p.k)}</td><td class="r">${n(p.n)}</td><td class="r">${n(p.u)}</td></tr>`).join('')}</table></section>
<section class="card"><h2>Sites d'origine</h2>${bars(m.refs.map((x) => ({ k: x.k, n: x.n })))}
<h2 style="margin-top:18px">Pays</h2>${bars(m.countries.map((x) => ({ k: x.k, n: x.n })))}</section>
</div>

<div class="grid two">
<section class="card"><h2>Questions FAQ ouvertes</h2>${bars(m.faqs.map((x) => ({ k: x.k, n: x.n })))}</section>
<section class="card"><h2>Parcours cliqués (UGC / SMM / communauté)</h2>${bars(m.themes.map((x) => ({ k: x.k, n: x.n })))}</section>
</div>

<section class="card"><h2>Derniers formulaires</h2><div class="scroll"><table>
<tr><th>Date</th><th>Nom</th><th>Email</th><th>Téléphone</th><th>Source</th><th>A acheté</th></tr>
${m.leads.slice(0, 50).map((l) => `<tr><td>${dt(l.ts)}</td><td>${esc(l.name)}</td><td>${esc(l.email)}</td><td>${esc(l.phone)}</td><td>${esc(l.src)}</td><td>${l.bought ? '<span class="ok">✓ oui</span>' : '<span class="muted">non</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun formulaire sur la période.</td></tr>'}
</table></div></section>

<section class="card"><h2>Derniers paiements</h2><div class="scroll"><table>
<tr><th>Date</th><th>Email</th><th class="r">Montant</th><th>Statut</th><th>Source</th></tr>
${m.orders.slice(0, 50).map((o) => `<tr><td>${dt(o.ts)}</td><td>${esc(o.email)}</td><td class="r">${eur(o.amount)}</td><td>${{ paid: 'Payé', expired: 'Abandonné', refunded: 'Remboursé' }[o.status] || esc(o.status)}${o.refunded && o.status === 'paid' ? ` (remb. ${eur(o.refunded)})` : ''}</td><td>${esc(o.src)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucun paiement sur la période.</td></tr>'}
</table></div></section>
</div>`;
  return page('PROPULSE · Stats', body);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    if (await passwordOk(form.get('password'), env)) {
      const h = new Headers({ location: '/admin' });
      for (const c of await sessionCookie(env)) h.append('set-cookie', c);
      return new Response(null, { status: 303, headers: h });
    }
    await new Promise((r) => setTimeout(r, 800));
    return new Response(await loginPage(true), { status: 401, headers: HEADERS });
  }
  if (path === '/admin/logout') {
    return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': logoutCookie } });
  }
  if (path !== '/admin') return new Response('Not found', { status: 404 });
  if (!(await isAuthed(request, env))) return new Response(await loginPage(false), { status: 200, headers: HEADERS });
  return new Response(await dashboard(env, url), { headers: HEADERS });
}
