// Admin side of live chat.
// GET    ?status=open|closed|all             -> { sessions, unread }
// GET    ?id=<sessionId>&after=<msgId>       -> { session, messages } (marks the chat read)
// POST   { id, message }                     -> reply to a visitor
// PATCH  { id, status: 'closed' | 'open' }   -> end or reopen a chat
// DELETE ?id=<sessionId>
import { db, ensureSchema } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError, str } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { MAX_MESSAGE, toMessage } from '../../lib/chat.js';

function toSession(r) {
  return {
    id: r.id, name: r.name, email: r.email, page: r.page, status: r.status, rating: r.rating,
    unread: r.admin_unread, createdAt: r.created_at, lastMessageAt: r.last_message_at,
    preview: r.preview || '', previewSender: r.preview_sender || ''
  };
}

export default route(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  requireAdmin(req);
  await ensureSchema();
  const { query } = db();
  const params = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'GET') {
    const id = str(params.get('id'), 64);
    if (id) {
      const rows = await query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
      if (!rows.length) throw new HttpError(404, 'Chat not found.');
      const after = Number(params.get('after')) || 0;
      const msgs = await query(`SELECT * FROM chat_messages WHERE session_id = $1 AND id > $2 ORDER BY id LIMIT 500`, [id, after]);
      if (rows[0].admin_unread) await query(`UPDATE chat_sessions SET admin_unread = 0 WHERE id = $1`, [id]);
      return send(res, 200, { session: toSession({ ...rows[0], admin_unread: 0 }), messages: msgs.map(toMessage) });
    }
    const status = params.get('status') || 'open';
    const where = status === 'open' ? `WHERE s.status = 'open'` : status === 'closed' ? `WHERE s.status = 'closed'` : '';
    const rows = await query(
      `SELECT s.*, m.body AS preview, m.sender AS preview_sender
       FROM chat_sessions s
       LEFT JOIN LATERAL (
         SELECT body, sender FROM chat_messages WHERE session_id = s.id AND sender <> 'system' ORDER BY id DESC LIMIT 1
       ) m ON true
       ${where}
       ORDER BY s.last_message_at DESC LIMIT 200`
    );
    const [{ unread, open }] = await query(
      `SELECT COALESCE(SUM(admin_unread), 0)::int AS unread, COUNT(*) FILTER (WHERE status = 'open')::int AS open FROM chat_sessions`
    );
    return send(res, 200, { sessions: rows.map(toSession), unread, open });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    const id = str(params.get('id'), 64);
    await query(`DELETE FROM chat_sessions WHERE id = $1`, [id]);
    return send(res, 200, { ok: true });
  }

  const body = await readJson(req);
  const id = str(body.id, 64);
  const rows = await query(`SELECT status FROM chat_sessions WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, 'Chat not found.');

  if (req.method === 'POST') {
    if (rows[0].status !== 'open') throw new HttpError(409, 'This chat has ended, so the visitor can no longer see new replies.');
    const message = str(body.message, MAX_MESSAGE + 1);
    if (!message) throw new HttpError(400, 'Type a reply first.');
    if (message.length > MAX_MESSAGE) throw new HttpError(400, `Replies can be up to ${MAX_MESSAGE} characters.`);
    const out = await query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'admin', $2) RETURNING *`, [id, message]);
    await query(`UPDATE chat_sessions SET last_message_at = now() WHERE id = $1`, [id]);
    return send(res, 201, { message: toMessage(out[0]) });
  }

  // PATCH
  if (body.status === 'closed' && rows[0].status === 'open') {
    await query(`UPDATE chat_sessions SET status = 'closed', closed_at = now() WHERE id = $1`, [id]);
    await query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'system', 'Chat ended by PrimeSphere')`, [id]);
  } else if (body.status === 'open' && rows[0].status === 'closed') {
    await query(`UPDATE chat_sessions SET status = 'open', closed_at = NULL WHERE id = $1`, [id]);
    await query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'system', 'Chat reopened')`, [id]);
  }
  send(res, 200, { ok: true });
});
