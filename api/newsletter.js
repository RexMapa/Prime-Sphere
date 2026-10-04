// Newsletter. One route for both sides (keeps the project within Vercel Hobby's function limit).
//
// Public:
//   POST ?action=subscribe    { email, page, website }   website = spam trap, must be empty
//   POST ?action=unsubscribe  { token }
// Admin (signed in):
//   GET  ?status=subscribed|unsubscribed|all&q=&format=csv  -> { subscribers, counts }
//   PATCH  { ids: [..], status: 'subscribed' | 'unsubscribed' }
//   DELETE ?id=<id>
import { randomBytes } from 'node:crypto';
import { db, ensureSchema } from '../lib/db.js';
import { route, send, readJson, ipHash, requireFetchHeader, HttpError, str } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function toSub(r) {
  return { id: r.id, email: r.email, status: r.status, source: r.source, createdAt: r.created_at, unsubscribedAt: r.unsubscribed_at };
}
function origin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host || ''}`;
}
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export default route(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  await ensureSchema();
  const { query } = db();
  const params = new URL(req.url, 'http://x').searchParams;
  const action = params.get('action');

  /* ---------- Public ---------- */
  if (req.method === 'POST' && action === 'subscribe') {
    const body = await readJson(req);
    if (body.website) return send(res, 200, { ok: true, status: 'subscribed' }); // bot: pretend it worked
    const email = str(body.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter an email like name@company.com.');
    const ip = ipHash(req);
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM subscribers WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'`, [ip]);
    if (n >= 5) throw new HttpError(429, 'Too many sign-ups from this connection. Try again in a few minutes.');
    const existing = await query(`SELECT * FROM subscribers WHERE email = $1`, [email]);
    if (existing.length && existing[0].status === 'subscribed') return send(res, 200, { ok: true, status: 'already' });
    if (existing.length) {
      await query(`UPDATE subscribers SET status = 'subscribed', unsubscribed_at = NULL, source = $2 WHERE id = $1`, [existing[0].id, str(body.page, 200)]);
      return send(res, 200, { ok: true, status: 'resubscribed' });
    }
    await query(
      `INSERT INTO subscribers (email, source, token, ip_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
      [email, str(body.page, 200), randomBytes(18).toString('base64url'), ip]);
    return send(res, 201, { ok: true, status: 'subscribed' });
  }

  if (req.method === 'POST' && action === 'unsubscribe') {
    const body = await readJson(req);
    const token = str(body.token, 100);
    if (!token) throw new HttpError(400, 'This unsubscribe link is incomplete.');
    const rows = await query(
      `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE token = $1 RETURNING email`, [token]);
    if (!rows.length) throw new HttpError(404, 'This unsubscribe link is not valid. You may already be removed from the list.');
    return send(res, 200, { ok: true, email: rows[0].email });
  }

  /* ---------- Admin ---------- */
  await requireAdmin(req);

  if (req.method === 'GET') {
    const status = params.get('status') || 'subscribed';
    const q = str(params.get('q'), 100).toLowerCase();
    const where = [], args = [];
    if (status === 'subscribed' || status === 'unsubscribed') { args.push(status); where.push(`status = $${args.length}`); }
    if (q) { args.push('%' + q.replace(/[%_\\]/g, '\\$&') + '%'); where.push(`email LIKE $${args.length}`); }
    const sql = `SELECT * FROM subscribers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;

    if (params.get('format') === 'csv') {
      const rows = await query(sql, args);
      const base = origin(req);
      const lines = [['email', 'status', 'subscribed_at', 'signup_page', 'unsubscribe_url'].join(',')].concat(rows.map((r) =>
        [r.email, r.status, new Date(r.created_at).toISOString(), r.source, `${base}/unsubscribe?token=${r.token}`].map(csvCell).join(',')));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="primesphere-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end('\uFEFF' + lines.join('\n'));
    }

    const rows = await query(sql + ' LIMIT 1000', args);
    const [c] = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'subscribed')::int AS subscribed,
              COUNT(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed,
              COUNT(*) FILTER (WHERE status = 'subscribed' AND created_at > now() - interval '7 days')::int AS "thisWeek"
       FROM subscribers`);
    return send(res, 200, { subscribers: rows.map(toSub), counts: c });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    await query(`DELETE FROM subscribers WHERE id = $1`, [Number(params.get('id'))]);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new HttpError(400, 'Nothing selected.');
    if (body.status === 'unsubscribed') {
      await query(`UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE id = ANY($1::int[])`, [ids]);
    } else if (body.status === 'subscribed') {
      await query(`UPDATE subscribers SET status = 'subscribed', unsubscribed_at = NULL WHERE id = ANY($1::int[])`, [ids]);
    } else throw new HttpError(400, 'Unknown status.');
    return send(res, 200, { ok: true });
  }

  throw new HttpError(400, 'Unknown action.');
});
