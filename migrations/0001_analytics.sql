-- 0001 — Analytics first-party de manonbian.fr.
--
-- events : envoyés par le navigateur (public/js/site.js → POST /api/ev).
--   Aucune IP ni user-agent brut : pays (header Cloudflare), classe d'appareil
--   et canal d'origine sont calculés à l'ingestion. vid/sid sont des
--   identifiants aléatoires first-party (localStorage/sessionStorage).
-- leads  : réponses du formulaire Tally (webhook signé /api/tally).
-- orders : paiements Stripe (webhook signé /api/stripe).

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,              -- ms epoch (horloge serveur)
  day       TEXT    NOT NULL,              -- AAAA-MM-JJ, heure de Paris
  event     TEXT    NOT NULL,
  vid       TEXT    NOT NULL,
  sid       TEXT    NOT NULL,
  path      TEXT,
  source    TEXT,                          -- canal : utm_source > app in-app > referrer > direct
  medium    TEXT,
  campaign  TEXT,
  content   TEXT,
  ref_host  TEXT,
  country   TEXT,
  device    TEXT,                          -- mobile | tablet | desktop
  props     TEXT                           -- JSON
);
CREATE INDEX IF NOT EXISTS idx_events_ts       ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_event_ts ON events (event, ts);
CREATE INDEX IF NOT EXISTS idx_events_vid      ON events (vid, ts);

CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  day           TEXT    NOT NULL,
  submission_id TEXT    NOT NULL UNIQUE,
  email         TEXT,
  name          TEXT,
  phone         TEXT,
  vid           TEXT,
  source        TEXT,
  campaign      TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_ts    ON leads (ts);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,
  day             TEXT    NOT NULL,
  session_id      TEXT    NOT NULL UNIQUE,
  payment_intent  TEXT,
  status          TEXT    NOT NULL,        -- paid | expired | refunded
  amount          INTEGER,                 -- centimes
  refunded        INTEGER NOT NULL DEFAULT 0,
  currency        TEXT,
  email           TEXT,
  vid             TEXT,
  payment_link    TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_ts ON orders (ts);
CREATE INDEX IF NOT EXISTS idx_orders_pi ON orders (payment_intent);
