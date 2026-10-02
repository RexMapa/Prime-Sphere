// Neon connection + automatic table setup (runs once per server instance).
import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';
import { SEED_STORES, SEED_CONTENT } from './seed.js';

let client = null;
let ready = null;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      const e = new HttpError(500, 'DATABASE_URL is not set. Connect Neon to this Vercel project.');
      e.expose = true;
      throw e;
    }
    const sql = neon(url);
    client = { query: (text, params = []) => sql.query(text, params) };
  }
  return client;
}

// For tests only: swap in another client with the same query(text, params) shape.
export function __setClient(c) { client = c; ready = null; }

export function ensureSchema() {
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  return ready;
}

async function migrate() {
  const { query } = db();
  await query(`CREATE TABLE IF NOT EXISTS submissions (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    company     TEXT NOT NULL DEFAULT '',
    help_with   TEXT NOT NULL DEFAULT '',
    discuss     TEXT[] NOT NULL DEFAULT '{}',
    budget      TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'new',
    ip_hash     TEXT NOT NULL DEFAULT ''
  )`);
  await query(`CREATE INDEX IF NOT EXISTS submissions_created_idx ON submissions (created_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS stores (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    pages       JSONB NOT NULL DEFAULT '[]'::jsonb,
    featured    BOOLEAN NOT NULL DEFAULT false,
    published   BOOLEAN NOT NULL DEFAULT true,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS login_attempts (
    ip_hash     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (ip_hash, created_at)`);
  await query(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  // Bookings live in the submissions table with kind = 'booking'.
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'message'`);
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS call_date TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS call_time TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`);
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS visitor_tz TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 0`);
  // One booking per time slot (cancelled bookings free the slot again).
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_idx ON submissions (starts_at) WHERE kind = 'booking' AND status <> 'cancelled'`);

  await query(`CREATE TABLE IF NOT EXISTS content_items (
    id          SERIAL PRIMARY KEY,
    type        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    published   BOOLEAN NOT NULL DEFAULT true,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS content_type_idx ON content_items (type, sort_order, id)`);
  await query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL)`);
  const seededContent = await query(`INSERT INTO app_meta (key, value) VALUES ('seeded_content', '1') ON CONFLICT (key) DO NOTHING RETURNING key`);
  if (seededContent.length) {
    for (const [type, items] of Object.entries(SEED_CONTENT)) {
      for (let i = 0; i < items.length; i++) {
        await query(`INSERT INTO content_items (type, data, sort_order) VALUES ($1, $2::jsonb, $3)`, [type, JSON.stringify(items[i]), i]);
      }
    }
  }

  await query(`CREATE TABLE IF NOT EXISTS chat_sessions (
    id              TEXT PRIMARY KEY,
    token_hash      TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL DEFAULT '',
    page            TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'open',
    rating          TEXT NOT NULL DEFAULT '',
    admin_unread    INTEGER NOT NULL DEFAULT 0,
    ip_hash         TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ
  )`);
  await query(`CREATE INDEX IF NOT EXISTS chat_sessions_last_idx ON chat_sessions (last_message_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS chat_messages (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender      TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, id)`);

  // Seed the placeholder stores only once, ever (deleting them later won't bring them back).
  const seeded = await query(`INSERT INTO app_meta (key, value) VALUES ('seeded_stores', '1') ON CONFLICT (key) DO NOTHING RETURNING key`);
  if (seeded.length) {
    for (let i = 0; i < SEED_STORES.length; i++) {
      const s = SEED_STORES[i];
      await query(
        `INSERT INTO stores (name, category, url, pages, featured, published, sort_order) VALUES ($1, $2, $3, $4::jsonb, $5, true, $6)`,
        [s.name, s.category, s.url, JSON.stringify(s.pages), s.featured, i]
      );
    }
  }
}
