// Admin: contact form submissions.
// GET    ?status=new|read|archived|all&q=search&format=csv
// PATCH  { ids: [1,2], status: 'read' | 'new' | 'archived' }
// DELETE ?id=123
import { db, ensureSchema } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError, str } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

const STATUSES = ['new', 'read', 'archived'];

function toJson(r) {
  return {
    id: r.id, createdAt: r.created_at, status: r.status,
    firstName: r.first_name, lastName: r.last_name, company: r.company, helpWith: r.help_with,
    discuss: r.discuss || [], budget: r.budget, email: r.email, phone: r.phone
  };
}

function csvCell(v) {
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  // stop spreadsheet formula injection (plain numbers like +63 912 345 6789 are left alone)
  if (/^[=+\-@\t\r]/.test(s) && !/^[+\-]?[\d\s().-]+$/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export default route(['GET', 'PATCH', 'DELETE'], async (req, res) => {
  requireAdmin(req);
  await ensureSchema();
  const { query } = db();
  const params = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'GET') {
    const status = params.get('status') || 'active';
    const q = str(params.get('q'), 100);
    const where = [];
    const args = [];
    if (status === 'active') where.push(`status <> 'archived'`);
    else if (STATUSES.includes(status)) { args.push(status); where.push(`status = $${args.length}`); }
    if (q) {
      args.push('%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%');
      const p = `$${args.length}`;
      where.push(`(first_name ILIKE ${p} OR last_name ILIKE ${p} OR email ILIKE ${p} OR company ILIKE ${p} OR help_with ILIKE ${p} OR phone ILIKE ${p})`);
    }
    const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await query(`SELECT * FROM submissions ${sqlWhere} ORDER BY created_at DESC LIMIT 1000`, args);

    if (params.get('format') === 'csv') {
      const head = ['Date', 'Status', 'First name', 'Last name', 'Company', 'Needs help with', 'Topics', 'Budget', 'Email', 'Phone'];
      const lines = [head.map(csvCell).join(',')].concat(rows.map((r) =>
        [new Date(r.created_at).toISOString(), r.status, r.first_name, r.last_name, r.company, r.help_with, r.discuss, r.budget, r.email, r.phone].map(csvCell).join(',')));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="primesphere-messages-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end('\uFEFF' + lines.join('\r\n'));
    }

    const counts = await query(`SELECT status, count(*)::int AS n FROM submissions GROUP BY status`);
    const c = { new: 0, read: 0, archived: 0 };
    counts.forEach((r) => { c[r.status] = r.n; });
    return send(res, 200, { submissions: rows.map(toJson), counts: c });
  }

  requireFetchHeader(req);

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter(Number.isInteger);
    if (!ids.length) throw new HttpError(400, 'No messages selected.');
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Unknown status.');
    await query(`UPDATE submissions SET status = $1 WHERE id = ANY($2::int[])`, [body.status, ids]);
    return send(res, 200, { ok: true });
  }

  const id = Number(params.get('id'));
  if (!Number.isInteger(id)) throw new HttpError(400, 'Missing message id.');
  await query(`DELETE FROM submissions WHERE id = $1`, [id]);
  send(res, 200, { ok: true });
});
