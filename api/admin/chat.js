// Admin side of live chat. One admin handles a chat at a time.
// GET    ?status=open|mine|unassigned|closed|all  -> { sessions, unread, open, mine, unassigned, me }
// GET    ?id=<sessionId>&after=<msgId>            -> { session, messages }
// POST   { id, message }                          -> reply (takes the chat first if nobody has it)
// PATCH  { id, action: 'claim' | 'takeover' | 'release' }
// PATCH  { id, status: 'closed' | 'open' }        -> end or reopen
// DELETE ?id=<sessionId>
import { db, ensureSchema } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError, str } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { MAX_MESSAGE, toMessage } from '../../lib/chat.js';

function toSession(r, me) {
  return {
    id: r.id, name: r.name, email: r.email, page: r.page, status: r.status, rating: r.rating,
    unread: r.admin_unread, createdAt: r.created_at, lastMessageAt: r.last_message_at,
    preview: r.preview || '', previewSender: r.preview_sender || '', previewAdminId: r.preview_admin_id || null,
    assignedId: r.assigned_admin_id || null, assignedName: r.assigned_name || '', assignedAt: r.assigned_at,
    mine: r.assigned_admin_id === me.id
  };
}

// Who may act on a chat: the admin handling it, anyone if nobody has it, or a super admin.
function canManage(s, me) {
  return !s.assigned_admin_id || s.assigned_admin_id === me.id || me.role === 'super';
}
function takenError(s) {
  return new HttpError(409, `${s.assigned_name || 'Another admin'} is handling this chat.`);
}

export default route(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const me = await requireAdmin(req);
  await ensureSchema();
  const { query } = db();
  const params = new URL(req.url, 'http://x').searchParams;
  const note = (id, body) => query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'note', $2)`, [id, body]);
  const sys = (id, body) => query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'system', $2)`, [id, body]);

  if (req.method === 'GET') {
    const id = str(params.get('id'), 64);
    if (id) {
      const rows = await query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
      if (!rows.length) throw new HttpError(404, 'Chat not found.');
      const s = rows[0];
      const after = Number(params.get('after')) || 0;
      const msgs = await query(`SELECT * FROM chat_messages WHERE session_id = $1 AND id > $2 ORDER BY id LIMIT 500`, [id, after]);
      // Only the admin handling the chat (or anyone, if nobody has it yet) clears its unread count.
      const reader = !s.assigned_admin_id || s.assigned_admin_id === me.id;
      if (reader && s.admin_unread) { await query(`UPDATE chat_sessions SET admin_unread = 0 WHERE id = $1`, [id]); s.admin_unread = 0; }
      return send(res, 200, { session: toSession(s, me), messages: msgs.map(toMessage) });
    }
    const status = params.get('status') || 'open';
    const where = {
      open: `WHERE s.status = 'open'`,
      mine: `WHERE s.status = 'open' AND s.assigned_admin_id = $1`,
      unassigned: `WHERE s.status = 'open' AND s.assigned_admin_id IS NULL`,
      closed: `WHERE s.status = 'closed'`,
      all: ''
    }[status] || `WHERE s.status = 'open'`;
    const usesMe = where.includes('$1');
    const rows = await query(
      `SELECT s.*, m.body AS preview, m.sender AS preview_sender, m.admin_id AS preview_admin_id
       FROM chat_sessions s
       LEFT JOIN LATERAL (
         SELECT body, sender, admin_id FROM chat_messages WHERE session_id = s.id AND sender IN ('visitor', 'admin') ORDER BY id DESC LIMIT 1
       ) m ON true
       ${where}
       ORDER BY s.last_message_at DESC LIMIT 200`, usesMe ? [me.id] : []);
    // Unread badge counts only chats you can answer: yours and unassigned ones.
    const [c] = await query(
      `SELECT
         COALESCE(SUM(admin_unread) FILTER (WHERE status = 'open' AND (assigned_admin_id IS NULL OR assigned_admin_id = $1)), 0)::int AS unread,
         COUNT(*) FILTER (WHERE status = 'open')::int AS open,
         COUNT(*) FILTER (WHERE status = 'open' AND assigned_admin_id = $1)::int AS mine,
         COUNT(*) FILTER (WHERE status = 'open' AND assigned_admin_id IS NULL)::int AS unassigned
       FROM chat_sessions`, [me.id]);
    return send(res, 200, { sessions: rows.map((r) => toSession(r, me)), ...c, me: { id: me.id, name: me.name, role: me.role } });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    const id = str(params.get('id'), 64);
    const rows = await query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
    if (rows.length && !canManage(rows[0], me)) throw takenError(rows[0]);
    await query(`DELETE FROM chat_sessions WHERE id = $1`, [id]);
    return send(res, 200, { ok: true });
  }

  const body = await readJson(req);
  const id = str(body.id, 64);
  const rows = await query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, 'Chat not found.');
  const s = rows[0];

  // Atomically take an unassigned chat. Returns true if this admin now has it.
  async function claim() {
    if (s.assigned_admin_id === me.id) return true;
    const got = await query(
      `UPDATE chat_sessions SET assigned_admin_id = $2, assigned_name = $3, assigned_at = now()
       WHERE id = $1 AND assigned_admin_id IS NULL RETURNING id`, [id, me.id, me.name]);
    if (!got.length) return false;
    await sys(id, `${me.name} joined the chat`);
    return true;
  }

  if (req.method === 'POST') {
    if (s.status !== 'open') throw new HttpError(409, 'This chat has ended, so the visitor can no longer see new replies.');
    const message = str(body.message, MAX_MESSAGE + 1);
    if (!message) throw new HttpError(400, 'Type a reply first.');
    if (message.length > MAX_MESSAGE) throw new HttpError(400, `Replies can be up to ${MAX_MESSAGE} characters.`);
    if (!(await claim())) {
      const now = await query(`SELECT assigned_name FROM chat_sessions WHERE id = $1`, [id]);
      throw takenError(now[0] || s);
    }
    const out = await query(
      `INSERT INTO chat_messages (session_id, sender, body, admin_id, admin_name) VALUES ($1, 'admin', $2, $3, $4) RETURNING *`,
      [id, message, me.id, me.name]);
    await query(`UPDATE chat_sessions SET last_message_at = now() WHERE id = $1`, [id]);
    return send(res, 201, { message: toMessage(out[0]) });
  }

  // PATCH: ownership
  if (body.action === 'claim') {
    if (s.status !== 'open') throw new HttpError(409, 'This chat has ended. Reopen it first.');
    if (!(await claim())) {
      const now = await query(`SELECT assigned_name FROM chat_sessions WHERE id = $1`, [id]);
      throw takenError(now[0] || s);
    }
    return send(res, 200, { ok: true });
  }
  if (body.action === 'takeover') {
    if (me.role !== 'super') throw new HttpError(403, 'Only super admins can take over a chat from someone else.');
    if (s.assigned_admin_id === me.id) return send(res, 200, { ok: true });
    await query(`UPDATE chat_sessions SET assigned_admin_id = $2, assigned_name = $3, assigned_at = now() WHERE id = $1`, [id, me.id, me.name]);
    if (s.assigned_admin_id) await note(id, `${me.name} took over from ${s.assigned_name || 'another admin'}`);
    if (s.status === 'open') await sys(id, `${me.name} joined the chat`);
    return send(res, 200, { ok: true });
  }
  if (body.action === 'release') {
    if (!s.assigned_admin_id) return send(res, 200, { ok: true });
    if (s.assigned_admin_id !== me.id && me.role !== 'super') throw takenError(s);
    await query(`UPDATE chat_sessions SET assigned_admin_id = NULL, assigned_name = '', assigned_at = NULL WHERE id = $1`, [id]);
    await note(id, s.assigned_admin_id === me.id ? `${me.name} released the chat` : `${me.name} unassigned ${s.assigned_name || 'the admin'}`);
    return send(res, 200, { ok: true });
  }

  // PATCH: end or reopen
  if (!canManage(s, me)) throw takenError(s);
  if (body.status === 'closed' && s.status === 'open') {
    await query(`UPDATE chat_sessions SET status = 'closed', closed_at = now() WHERE id = $1`, [id]);
    await sys(id, `Chat ended by ${me.name}`);
  } else if (body.status === 'open' && s.status === 'closed') {
    await query(`UPDATE chat_sessions SET status = 'open', closed_at = NULL WHERE id = $1`, [id]);
    await sys(id, 'Chat reopened');
  }
  send(res, 200, { ok: true });
});
