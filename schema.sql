-- Reference only: the site creates these tables automatically on first use (lib/db.js).
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
  help_with TEXT NOT NULL DEFAULT '', discuss TEXT[] NOT NULL DEFAULT '{}', budget TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', ip_hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  pages JSONB NOT NULL DEFAULT '[]'::jsonb, featured BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'admin',
  is_owner BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true, password_hash TEXT NOT NULL DEFAULT '',
  password_version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ
);
-- chat_sessions: assigned_admin_id INTEGER, assigned_name TEXT, assigned_at TIMESTAMPTZ
-- chat_messages: admin_id INTEGER, admin_name TEXT  (sender 'note' = visible to admins only)
