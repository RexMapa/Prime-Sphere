// Single-admin login using ADMIN_EMAIL / ADMIN_PASSWORD env vars and a signed, HttpOnly cookie.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const COOKIE = 'ps_admin';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function config() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!email || !password || !secret || secret.length < 32) {
    const e = new HttpError(500, 'Admin login is not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET (32+ characters) in Vercel.');
    e.expose = true;
    throw e;
  }
  return { email: email.trim().toLowerCase(), password, secret };
}

// Changing ADMIN_PASSWORD signs everyone out, because it is part of the signing key.
function key(cfg) {
  return createHash('sha256').update(cfg.secret + '|' + cfg.password).digest();
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const digest = (s) => createHash('sha256').update(String(s)).digest();

export function checkCredentials(email, password) {
  const cfg = config();
  const okEmail = timingSafeEqual(digest(String(email || '').trim().toLowerCase()), digest(cfg.email));
  const okPass = timingSafeEqual(digest(password || ''), digest(cfg.password));
  return okEmail && okPass;
}

export function setSession(req, res) {
  const cfg = config();
  const payload = b64(JSON.stringify({ sub: cfg.email, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const sig = b64(createHmac('sha256', key(cfg)).update(payload).digest());
  res.setHeader('Set-Cookie', cookie(req, `${payload}.${sig}`, MAX_AGE));
}

export function clearSession(req, res) {
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}

function cookie(req, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function getSession(req) {
  const cfg = config();
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', key(cfg)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.sub !== cfg.email || data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

export function requireAdmin(req) {
  const s = getSession(req);
  if (!s) throw new HttpError(401, 'Sign in to continue.');
  return s;
}
