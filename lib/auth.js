// Admin accounts and sessions.
//
// - The owner account comes from ADMIN_EMAIL / ADMIN_PASSWORD (env vars). It always works, so you
//   can never lock yourself out, and it can't be edited or deleted from the dashboard.
// - Other admins are created in /admin > Team and stored in the `admins` table (scrypt-hashed passwords).
// - Sessions are a signed, HttpOnly cookie that holds the admin id and a password version, and every
//   request re-checks the database, so disabling an admin or changing their password signs them out.
import { createHmac, createHash, timingSafeEqual, scrypt as scryptCb, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './http.js';
import { db, ensureSchema } from './db.js';

const scrypt = promisify(scryptCb);
const COOKIE = 'ps_admin';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const MIN_PASSWORD = 10;
export const ROLES = ['admin', 'super'];

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    const e = new HttpError(500, 'Admin login is not configured. Set SESSION_SECRET (32+ characters) in Vercel.');
    e.expose = true;
    throw e;
  }
  return s;
}
function ownerEnv() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  return email && password ? { email, password } : null;
}

// Changing ADMIN_PASSWORD still signs everyone out, because it is part of the signing key.
function key() {
  return createHash('sha256').update(secret() + '|' + (process.env.ADMIN_PASSWORD || '')).digest();
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const digest = (s) => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

/* ---------- Passwords ---------- */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${b64(salt)}$${b64(hash)}`;
}
export async function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const got = await scrypt(String(password || ''), Buffer.from(salt, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(got, expected);
}
export function checkPasswordRules(pw) {
  if (!pw || String(pw).length < MIN_PASSWORD) throw new HttpError(400, `Passwords need at least ${MIN_PASSWORD} characters.`);
  if (String(pw).length > 200) throw new HttpError(400, 'That password is too long.');
}

export function toAdmin(r) {
  return {
    id: r.id, name: r.name, email: r.email, role: r.role, isOwner: r.is_owner, active: r.active,
    createdAt: r.created_at, lastLoginAt: r.last_login_at
  };
}

/* ---------- Login ---------- */
// Returns the admin row, or null if the email/password don't match an active account.
export async function login(email, password) {
  secret();
  await ensureSchema();
  const { query } = db();
  const e = String(email || '').trim().toLowerCase();
  const owner = ownerEnv();

  if (owner && same(e, owner.email)) {
    if (!same(password || '', owner.password)) return null;
    const rows = await query(
      `INSERT INTO admins (email, name, role, is_owner, active, password_hash)
       VALUES ($1, 'Owner', 'super', true, true, '')
       ON CONFLICT (email) DO UPDATE SET role = 'super', is_owner = true, active = true
       RETURNING *`, [owner.email]);
    // Only one owner row: if ADMIN_EMAIL changed, the old owner row becomes a normal (disabled) account.
    await query(`UPDATE admins SET is_owner = false, active = false WHERE is_owner AND id <> $1`, [rows[0].id]);
    await query(`UPDATE admins SET last_login_at = now() WHERE id = $1`, [rows[0].id]);
    return rows[0];
  }

  const rows = await query(`SELECT * FROM admins WHERE email = $1 AND active AND NOT is_owner`, [e]);
  const ok = rows.length ? await verifyPassword(password, rows[0].password_hash) : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86));
  if (!rows.length || !ok) return null;
  await query(`UPDATE admins SET last_login_at = now() WHERE id = $1`, [rows[0].id]);
  return rows[0];
}

/* ---------- Session cookie ---------- */
export function setSession(req, res, admin) {
  const payload = b64(JSON.stringify({ aid: admin.id, pv: admin.password_version, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const sig = b64(createHmac('sha256', key()).update(payload).digest());
  res.setHeader('Set-Cookie', cookie(req, `${payload}.${sig}`, MAX_AGE));
}
export function clearSession(req, res) {
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}
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
    if (!data.aid || data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

// Returns the signed-in admin (fresh from the database) or null.
export async function getAdmin(req) {
  const c = readCookie(req);
  if (!c) return null;
  await ensureSchema();
  const rows = await db().query(`SELECT * FROM admins WHERE id = $1`, [c.aid]);
  const a = rows[0];
  if (!a || !a.active || a.password_version !== c.pv) return null;
  if (a.is_owner) {
    const owner = ownerEnv();
    if (!owner || owner.email !== a.email) return null; // ADMIN_EMAIL changed
  }
  return a;
}

export async function requireAdmin(req) {
  const a = await getAdmin(req);
  if (!a) throw new HttpError(401, 'Sign in to continue.');
  return a;
}
export async function requireSuper(req) {
  const a = await requireAdmin(req);
  if (a.role !== 'super') throw new HttpError(403, 'Only super admins can manage admin accounts.');
  return a;
}
