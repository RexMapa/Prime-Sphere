// Client accounts: invite, sign-in, onboarding, payment requests and proof of payment.
//
// Flow (clients.status):
//   invited         admin created the account; the client must replace the temporary password
//   onboarding      client is filling in the onboarding form (also where "Request changes" sends them)
//   review          onboarding submitted, waiting for an admin to approve it
//   payment         admin approved and sent a payment request (QR codes + amount)
//   payment_review  client uploaded a screenshot as proof, waiting for an admin to confirm
//   active          payment confirmed; the client sees their dashboard
//
// Client sessions use their own cookie (ps_client), separate from the admin cookie.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { HttpError, str } from './http.js';
import { db, ensureSchema } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';

const COOKIE = 'ps_client';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days
export const CLIENT_MIN_PASSWORD = 10;
export const STATUSES = ['invited', 'onboarding', 'review', 'payment', 'payment_review', 'active'];
export const CURRENCIES = ['USD', 'PHP', 'AUD', 'EUR', 'GBP', 'CAD', 'SGD'];
export const PORTAL_URL = 'https://portal.primespheres.online/';

/* ---------- Schema (runs once per server instance) ---------- */
let ready = null;
export function ensureClientSchema() {
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  return ready;
}
async function migrate() {
  await ensureSchema();
  const { query } = db();
  await query(`CREATE TABLE IF NOT EXISTS clients (
    id                   SERIAL PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL DEFAULT '',
    company              TEXT NOT NULL DEFAULT '',
    password_hash        TEXT NOT NULL DEFAULT '',
    password_version     INTEGER NOT NULL DEFAULT 1,
    must_change_password BOOLEAN NOT NULL DEFAULT true,
    active               BOOLEAN NOT NULL DEFAULT true,
    status               TEXT NOT NULL DEFAULT 'invited',
    onboarding           JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_at         TIMESTAMPTZ,
    admin_note           TEXT NOT NULL DEFAULT '',
    invoice              JSONB,
    proof_url            TEXT NOT NULL DEFAULT '',
    proof_uploaded_at    TIMESTAMPTZ,
    approved_at          TIMESTAMPTZ,
    approved_by          TEXT NOT NULL DEFAULT '',
    paid_at              TIMESTAMPTZ,
    confirmed_by         TEXT NOT NULL DEFAULT '',
    invited_by           TEXT NOT NULL DEFAULT '',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at        TIMESTAMPTZ
  )`);
  await query(`CREATE INDEX IF NOT EXISTS clients_status_idx ON clients (status, updated_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS payment_methods (
    id             SERIAL PRIMARY KEY,
    label          TEXT NOT NULL,
    account_name   TEXT NOT NULL DEFAULT '',
    account_number TEXT NOT NULL DEFAULT '',
    image_url      TEXT NOT NULL DEFAULT '',
    active         BOOLEAN NOT NULL DEFAULT true,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

/* ---------- Passwords ---------- */
export function checkClientPassword(pw) {
  if (!pw || String(pw).length < CLIENT_MIN_PASSWORD) throw new HttpError(400, `Use at least ${CLIENT_MIN_PASSWORD} characters for your password.`);
  if (String(pw).length > 200) throw new HttpError(400, 'That password is too long.');
}
// Readable temporary password for invites: no look-alike characters (0/O, 1/l/I).
export function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8);
}

/* ---------- Session cookie ---------- */
function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    const e = new HttpError(500, 'Sign-in is not configured. Set SESSION_SECRET (32+ characters) in Vercel.');
    e.expose = true;
    throw e;
  }
  return createHash('sha256').update('client|' + s).digest();
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function setClientSession(req, res, c) {
  const payload = b64(JSON.stringify({ cid: c.id, pv: c.password_version, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const sig = b64(createHmac('sha256', key()).update(payload).digest());
  res.setHeader('Set-Cookie', cookie(req, `${payload}.${sig}`, MAX_AGE));
}
export function clearClientSession(req, res) { res.setHeader('Set-Cookie', cookie(req, '', 0)); }
function cookie(req, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function readCookie(req) {
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', key()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.cid || data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

export async function getClient(req) {
  const c = readCookie(req);
  if (!c) return null;
  await ensureClientSchema();
  const rows = await db().query(`SELECT * FROM clients WHERE id = $1`, [c.cid]);
  const row = rows[0];
  if (!row || !row.active || row.password_version !== c.pv) return null;
  return row;
}
export async function requireClient(req) {
  const c = await getClient(req);
  if (!c) throw new HttpError(401, 'Sign in to continue.');
  return c;
}

export async function clientLogin(email, password) {
  await ensureClientSchema();
  const e = String(email || '').trim().toLowerCase();
  const rows = await db().query(`SELECT * FROM clients WHERE email = $1 AND active`, [e]);
  const ok = rows.length
    ? await verifyPassword(password, rows[0].password_hash)
    : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86)); // same timing either way
  if (!rows.length || !ok) return null;
  await db().query(`UPDATE clients SET last_login_at = now() WHERE id = $1`, [rows[0].id]);
  return rows[0];
}

/* ---------- Payment methods (QR codes) ---------- */
export function toMethod(r) {
  return { id: r.id, label: r.label, accountName: r.account_name, accountNumber: r.account_number, image: r.image_url, active: r.active, sortOrder: r.sort_order };
}
export async function methodsByIds(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!list.length) return [];
  const rows = await db().query(`SELECT * FROM payment_methods WHERE id = ANY($1::int[]) ORDER BY sort_order, id`, [list]);
  return rows.map(toMethod);
}

/* ---------- Shapes ---------- */
// What the client sees about their own account.
export async function toClientSelf(r) {
  const inv = r.invoice || null;
  return {
    id: r.id, name: r.name, email: r.email, company: r.company, status: r.status,
    mustChangePassword: r.must_change_password,
    onboarding: r.onboarding || {}, submittedAt: r.submitted_at, adminNote: r.admin_note,
    invoice: inv ? { amount: inv.amount, currency: inv.currency, note: inv.note || '', sentAt: inv.sentAt, methods: await methodsByIds(inv.methodIds) } : null,
    proofUrl: r.proof_url, proofUploadedAt: r.proof_uploaded_at,
    approvedAt: r.approved_at, paidAt: r.paid_at,
    portalUrl: PORTAL_URL
  };
}
// What admins see in the Clients list.
export function toClientAdmin(r) {
  return {
    id: r.id, name: r.name, email: r.email, company: r.company, status: r.status, active: r.active,
    mustChangePassword: r.must_change_password,
    onboarding: r.onboarding || {}, submittedAt: r.submitted_at, adminNote: r.admin_note,
    invoice: r.invoice || null, proofUrl: r.proof_url, proofUploadedAt: r.proof_uploaded_at,
    approvedAt: r.approved_at, approvedBy: r.approved_by, paidAt: r.paid_at, confirmedBy: r.confirmed_by,
    invitedBy: r.invited_by, createdAt: r.created_at, updatedAt: r.updated_at, lastLoginAt: r.last_login_at
  };
}

/* ---------- Onboarding answers ---------- */
// The form itself is defined in /client/onboarding-fields.js. Here we only keep answers tidy:
// short keys, strings or string lists, sensible lengths.
export const REQUIRED_FIELDS = [
  'fullName', 'role', 'phone', 'contactMethod', 'country',
  'businessName', 'website', 'industry', 'businessType', 'description',
  'services', 'primaryGoal', 'goals', 'startDate', 'budget',
  'audience',
  'billingName', 'billingEmail', 'agree'
];
export function cleanOnboarding(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input).slice(0, 80)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(k)) continue;
    if (Array.isArray(v)) out[k] = v.slice(0, 30).map((x) => str(x, 200)).filter(Boolean);
    else if (typeof v === 'boolean') out[k] = v;
    else if (v != null) out[k] = str(v, 4000);
  }
  return out;
}
export function missingFields(data) {
  return REQUIRED_FIELDS.filter((k) => {
    const v = data[k];
    if (Array.isArray(v)) return !v.length;
    if (typeof v === 'boolean') return !v;
    return !v || !String(v).trim();
  });
}
