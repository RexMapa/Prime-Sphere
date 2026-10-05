// POST /api/auth?action=login     { email, password }
// POST /api/auth?action=logout
// POST /api/auth?action=password  { current, password }   change your own password
// POST /api/auth?action=profile   { name }                 change your display name
// GET  /api/auth                  -> { id, name, email, role, isOwner } when signed in
// ?scope=client                    client accounts, see lib/client-api.js
import { db, ensureSchema } from '../lib/db.js';
import { route, send, readJson, ipHash, requireFetchHeader, HttpError, str } from '../lib/http.js';
import { login, setSession, clearSession, getAdmin, requireAdmin, toAdmin, hashPassword, checkPasswordRules } from '../lib/auth.js';
import { handleClient } from '../lib/client-api.js';

const MAX_FAILS = 8;

export default route(['GET', 'POST'], async (req, res) => {
  // Client accounts (onboarding and payments) share this function to stay under Vercel's function limit.
  const params = new URL(req.url, 'http://x').searchParams;
  if (params.get('scope') === 'client') return handleClient(req, res, params.get('action'));

  if (req.method === 'GET') {
    const a = await getAdmin(req);
    if (!a) return send(res, 401, { error: 'Not signed in.' });
    return send(res, 200, toAdmin(a));
  }
  requireFetchHeader(req);
  const action = new URL(req.url, 'http://x').searchParams.get('action');

  if (action === 'logout') {
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (action === 'password' || action === 'profile') {
    const me = await requireAdmin(req);
    const body = await readJson(req);
    const { query } = db();
    if (action === 'profile') {
      const name = str(body.name, 60);
      if (!name) throw new HttpError(400, 'Enter your name.');
      await query(`UPDATE admins SET name = $2 WHERE id = $1`, [me.id, name]);
      await query(`UPDATE chat_sessions SET assigned_name = $2 WHERE assigned_admin_id = $1`, [me.id, name]);
      return send(res, 200, { ok: true });
    }
    if (me.is_owner) throw new HttpError(400, 'The owner password is set by ADMIN_PASSWORD in Vercel. Change it there and redeploy.');
    const check = await login(me.email, body.current);
    if (!check || check.id !== me.id) throw new HttpError(400, 'Your current password is incorrect.');
    checkPasswordRules(body.password);
    const rows = await query(
      `UPDATE admins SET password_hash = $2, password_version = password_version + 1 WHERE id = $1 RETURNING *`,
      [me.id, await hashPassword(body.password)]);
    setSession(req, res, rows[0]); // stay signed in here; other devices are signed out
    return send(res, 200, { ok: true });
  }

  if (action !== 'login') throw new HttpError(400, 'Unknown action.');

  const { email, password } = await readJson(req);
  await ensureSchema();
  const { query } = db();
  const ip = ipHash(req);
  await query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`);
  const [{ n }] = await query(`SELECT count(*)::int AS n FROM login_attempts WHERE ip_hash = $1 AND created_at > now() - interval '15 minutes'`, [ip]);
  if (n >= MAX_FAILS) throw new HttpError(429, 'Too many failed sign-in attempts. Wait 15 minutes and try again.');
  const admin = await login(email, password);
  if (!admin) {
    await query(`INSERT INTO login_attempts (ip_hash) VALUES ($1)`, [ip]);
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  await query(`DELETE FROM login_attempts WHERE ip_hash = $1`, [ip]);
  setSession(req, res, admin);
  send(res, 200, toAdmin(admin));
});
