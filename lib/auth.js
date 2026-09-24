// Session admin : cookie signé HMAC (clé dérivée d'ADMIN_PASSWORD — changer
// le mot de passe déconnecte toutes les sessions).

import { hmacBytes, toHex, safeEqual } from './util.js';

const COOKIE = 'pt_admin';
const TTL_S = 30 * 24 * 3600;

export async function sessionCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  const sig = toHex(await hmacBytes(`session:${env.ADMIN_PASSWORD}`, String(exp)));
  const attrs = `Path=/; Max-Age=${TTL_S}; HttpOnly; Secure; SameSite=Lax`;
  // pt_ignore : les visites depuis ce navigateur ne sont plus comptées (lu par /api/ev).
  return [`${COOKIE}=${exp}.${sig}; ${attrs}`, `pt_ignore=1; Path=/; Max-Age=${365 * 24 * 3600}; Secure; SameSite=Lax`];
}

export async function isAuthed(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)pt_admin=(\d+)\.([a-f0-9]{64})/);
  if (!m || Number(m[1]) < Date.now() / 1000) return false;
  const expected = toHex(await hmacBytes(`session:${env.ADMIN_PASSWORD}`, m[1]));
  return safeEqual(m[2], expected);
}

export async function passwordOk(input, env) {
  if (!env.ADMIN_PASSWORD || typeof input !== 'string') return false;
  // Comparaison sur empreintes : longueur constante.
  const a = toHex(await hmacBytes('pw', input));
  const b = toHex(await hmacBytes('pw', env.ADMIN_PASSWORD));
  return safeEqual(a, b);
}

export const logoutCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
