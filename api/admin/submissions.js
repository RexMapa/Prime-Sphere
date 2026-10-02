// Admin: contact form messages and booked calls.
// GET    ?kind=message&status=active|new|read|archived|all&q=&format=csv
// GET    ?kind=booking&status=upcoming|past|cancelled|all&q=&format=csv
// PATCH  { ids: [1,2], status }
// DELETE ?id=123
import { db, ensureSchema } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError, str } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

const STATUSES = {
  message: ['new', 'read', 'archived'],
  booking: ['new', 'confirmed', 'completed', 'cancelled']
};

function toJson(r) {
  return {
    id: r.id, kind: r.kind, createdAt: r.created_at, status: r.status,
    firstName: r.first_name, lastName: r.last_name, company: r.company, helpWith: r.help_with,
    discuss: r.discuss || [], budget: r.budget, email: r.email, phone: r.phone,
    callDate: r.call_date, callTime: r.call_time, startsAt: r.starts_at, timezone: r.timezone,
    visitorTz: r.visitor_tz, duration: r.duration
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
  const kind = params.get('kind') === 'booking' ? 'booking' : 'message';

  if (req.method === 'GET') {
    const status = params.get('status') || (kind === 'booking' ? 'upcoming' : 'active');
    const q = str(params.get('q'), 100);
    const args = [kind];
    const where = ['kind = $1'];
    let order = 'created_at DESC';
    if (kind === 'message') {
      if (status === 'active') where.push(`status <> 'archived'`);
      else if (STATUSES.message.includes(status)) { args.push(status); where.push(`status = $${args.length}`); }
    } else {
      if (status === 'upcoming') { where.push(`status <> 'cancelled' AND starts_at >= now() - interval '1 hour'`); order = 'starts_at ASC'; }
      else if (status === 'past') { where.push(`status <> 'cancelled' AND starts_at < now() - interval '1 hour'`); order = 'starts_at DESC'; }
      else if (status === 'cancelled') { where.push(`status = 'cancelled'`); order = 'starts_at DESC'; }
      else order = 'starts_at DESC';
    }
    if (q) {
      args.push('%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%');
      const p = `$${args.length}`;
      where.push(`(first_name ILIKE ${p} OR last_name ILIKE ${p} OR email ILIKE ${p} OR company ILIKE ${p} OR help_with ILIKE ${p} OR phone ILIKE ${p})`);
    }
    const rows = await query(`SELECT * FROM submissions WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 1000`, args);

    if (params.get('format') === 'csv') {
      const isB = kind === 'booking';
      const head = (isB ? ['Call date', 'Call time', 'Time zone', 'Length (min)'] : []).concat(['Submitted', 'Status', 'First name', 'Last name', 'Company', isB ? 'Notes' : 'Needs help with', 'Topics', 'Budget', 'Email', 'Phone']);
      const lines = [head.map(csvCell).join(',')].concat(rows.map((r) =>
        (isB ? [r.call_date, r.call_time, r.timezone, r.duration] : []).concat([new Date(r.created_at).toISOString(), r.status, r.first_name, r.last_name, r.company, r.help_with, r.discuss, r.budget, r.email, r.phone]).map(csvCell).join(',')));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="primesphere-${isB ? 'bookings' : 'messages'}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end('\uFEFF' + lines.join('\r\n'));
    }

    const counts = await query(
      `SELECT
         COUNT(*) FILTER (WHERE kind = 'message' AND status = 'new')::int AS new_messages,
         COUNT(*) FILTER (WHERE kind = 'message' AND status = 'archived')::int AS archived_messages,
         COUNT(*) FILTER (WHERE kind = 'booking' AND status = 'new' AND starts_at >= now())::int AS new_bookings,
         COUNT(*) FILTER (WHERE kind = 'booking' AND status <> 'cancelled' AND starts_at >= now() - interval '1 hour')::int AS upcoming_bookings
       FROM submissions`
    );
    const c = counts[0];
    return send(res, 200, {
      submissions: rows.map(toJson),
      counts: { new: c.new_messages, archived: c.archived_messages, newBookings: c.new_bookings, upcoming: c.upcoming_bookings }
    });
  }

  requireFetchHeader(req);

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter(Number.isInteger);
    if (!ids.length) throw new HttpError(400, 'Nothing selected.');
    const allowed = [...new Set([...STATUSES.message, ...STATUSES.booking])];
    if (!allowed.includes(body.status)) throw new HttpError(400, 'Unknown status.');
    try {
      await query(
        `UPDATE submissions SET status = $1 WHERE id = ANY($2::int[]) AND ((kind = 'message' AND $1 = ANY($3::text[])) OR (kind = 'booking' AND $1 = ANY($4::text[])))`,
        [body.status, ids, STATUSES.message, STATUSES.booking]
      );
    } catch (e) {
      if (e.code === '23505' || /duplicate key|unique/i.test(e.message)) throw new HttpError(409, 'Another booking already has that time, so this one cannot be restored.');
      throw e;
    }
    return send(res, 200, { ok: true });
  }

  const id = Number(params.get('id'));
  if (!Number.isInteger(id)) throw new HttpError(400, 'Missing id.');
  await query(`DELETE FROM submissions WHERE id = $1`, [id]);
  send(res, 200, { ok: true });
});
