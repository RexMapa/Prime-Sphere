// POST /api/auth?action=login  { email, password }
// POST /api/auth?action=logout
// GET  /api/auth               -> { email } when signed in
import { db, ensureSchema } from '../lib/db.js';
import { route, send, readJson, ipHash, requireFetchHeader, HttpError } from '../lib/http.js';
import { checkCredentials, setSession, clearSession, getSession } from '../lib/auth.js';

const MAX_FAILS = 8;

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const s = getSession(req);
    if (!s) return send(res, 401, { error: 'Not signed in.' });
    return send(res, 200, { email: s.sub });
  }
  requireFetchHeader(req);
  const action = new URL(req.url, 'http://x').searchParams.get('action');

  if (action === 'logout') {
    clearSession(req, res);
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
  if (!checkCredentials(email, password)) {
    await query(`INSERT INTO login_attempts (ip_hash) VALUES ($1)`, [ip]);
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  await query(`DELETE FROM login_attempts WHERE ip_hash = $1`, [ip]);
  setSession(req, res);
  send(res, 200, { ok: true });
});
