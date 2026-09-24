// Utilitaires partagés par les fonctions Pages (hors de functions/ : pas de route).

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

export function parisDay(ms) {
  return dayFmt.format(new Date(ms));
}

export function clip(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function deviceOf(ua) {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Navigateurs intégrés des apps : Instagram/TikTok n'envoient souvent aucun
// referrer, l'user-agent est alors le seul indice d'origine.
export function inAppOf(ua) {
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  return null;
}

const REF_CHANNELS = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook'],
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)(linktr\.ee|linkin\.bio|beacons\.ai)$/, 'linkinbio'],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)snapchat\.com$/, 'snapchat'],
  [/(^|\.)pinterest\./, 'pinterest'],
];

export function channelOf(utmSource, ua, refHost) {
  if (utmSource) return utmSource.toLowerCase();
  const app = inAppOf(ua);
  if (app) return app;
  if (refHost) {
    for (const [re, name] of REF_CHANNELS) if (re.test(refHost)) return name;
    return refHost;
  }
  return 'direct';
}

export const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|curl|wget|python|axios|node-fetch/i;

const enc = new TextEncoder();

export async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
