// Visitor side of live chat.
// POST ?action=start   { message, page }          -> { id, token, messages, status }
// POST ?action=send    { message }                 (headers: X-Chat-Id, X-Chat-Token)
// POST ?action=profile { name, email }
// POST ?action=end
// POST ?action=rate    { rating: 'up' | 'down' }
// GET  ?after=<lastMessageId>                      -> { messages, status, rating }
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db, ensureSchema } from '../lib/db.js';
import { route, send, readJson, ipHash, HttpError, str } from '../lib/http.js';
import { MAX_MESSAGE, toMessage } from '../lib/chat.js';

const hash = (t) => createHash('sha256').update(String(t || '')).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function issueCode(id, query) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = randomBytes(12);
    const letters = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    const code = 'PS-' + letters.match(/.{4}/g).join('-');
    try { await query('UPDATE chat_sessions SET recovery_hash = $2 WHERE id = $1', [id, hash(code)]); return code; }
    catch (error) { if (error.code !== '23505') throw error; }
  }
  throw new HttpError(503, 'Could not create a chat code. Please try again.');
}

async function auth(req, query) {
  const id = str(req.headers['x-chat-id'], 64);
  const token = str(req.headers['x-chat-token'], 128);
  if (!id || !token) throw new HttpError(401, 'Chat not found. Start a new chat.');
  const rows = await query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, 'This chat no longer exists. Start a new chat.');
  const a = Buffer.from(rows[0].token_hash, 'hex');
  const b = Buffer.from(hash(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Chat not found. Start a new chat.');
  return rows[0];
}

function cleanMessage(v) {
  const m = str(v, MAX_MESSAGE + 1);
  if (!m) throw new HttpError(400, 'Type a message first.');
  if (m.length > MAX_MESSAGE) throw new HttpError(400, `Messages can be up to ${MAX_MESSAGE} characters.`);
  return m;
}

export default route(['GET', 'POST'], async (req, res) => {
  await ensureSchema();
  const { query } = db();
  const params = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'GET') {
    const s = await auth(req, query);
    const after = Number(params.get('after')) || 0;
    const rows = await query(`SELECT * FROM chat_messages WHERE session_id = $1 AND id > $2 AND sender <> 'note' ORDER BY id LIMIT 200`, [s.id, after]);
    return send(res, 200, { messages: rows.map(toMessage), status: s.status, rating: s.rating, email: s.email });
  }

  const action = params.get('action');
  const body = await readJson(req);

  if (action === 'recover') {
    const ip = 'chat-recovery|' + ipHash(req);
    const [{ n }] = await query("SELECT count(*)::int AS n FROM login_attempts WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'", [ip]);
    if (n >= 10) throw new HttpError(429, 'Too many attempts. Try again in ten minutes.');
    await query('INSERT INTO login_attempts (ip_hash) VALUES ($1)', [ip]);
    const code = str(body.code, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^PS[A-HJ-NP-Z2-9]{12}$/.test(code)) throw new HttpError(400, 'Enter a code like PS-7K4M-9Q2X-6R8T.');
    const formatted = 'PS-' + code.slice(2).match(/.{4}/g).join('-');
    const [session] = await query('SELECT * FROM chat_sessions WHERE recovery_hash = $1', [hash(formatted)]);
    if (!session) throw new HttpError(400, 'This chat code is invalid or expired.');
    const token = randomBytes(24).toString('base64url');
    await query('UPDATE chat_sessions SET token_hash = $2 WHERE id = $1', [session.id, hash(token)]);
    const messages = await query("SELECT * FROM chat_messages WHERE session_id = $1 AND sender <> 'note' ORDER BY id DESC LIMIT 500", [session.id]);
    return send(res, 200, { id: session.id, token, code: formatted, status: session.status, rating: session.rating, email: session.email, messages: messages.reverse().map(toMessage) });
  }

  if (action === 'start') {
    const message = cleanMessage(body.message);
    const ip = ipHash(req);
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM chat_sessions WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'`, [ip]);
    if (n >= 4) throw new HttpError(429, 'Too many new chats from this connection. Try again in a few minutes.');
    const id = randomUUID();
    const token = randomBytes(24).toString('base64url');
    await query(
      `INSERT INTO chat_sessions (id, token_hash, page, ip_hash, admin_unread) VALUES ($1, $2, $3, $4, 1)`,
      [id, hash(token), str(body.page, 300), ip]
    );
    await query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'visitor', $2)`, [id, message]);
    const rows = await query(`SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY id`, [id]);
    const code = await issueCode(id, query);
    return send(res, 201, { id, token, code, status: 'open', messages: rows.map(toMessage) });
  }

  const s = await auth(req, query);

  if (action === 'code') return send(res, 200, { code: await issueCode(s.id, query) });

  if (action === 'send') {
    if (s.status !== 'open') throw new HttpError(409, 'This chat has ended. Start a new chat to keep talking.');
    const message = cleanMessage(body.message);
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM chat_messages WHERE session_id = $1 AND sender = 'visitor' AND created_at > now() - interval '1 minute'`, [s.id]);
    if (n >= 15) throw new HttpError(429, 'You are sending messages very quickly. Wait a moment and try again.');
    const rows = await query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'visitor', $2) RETURNING *`, [s.id, message]);
    await query(`UPDATE chat_sessions SET last_message_at = now(), admin_unread = admin_unread + 1 WHERE id = $1`, [s.id]);
    return send(res, 201, { message: toMessage(rows[0]) });
  }

  if (action === 'profile') {
    const email = str(body.email, 200);
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter an email like name@company.com.');
    await query(`UPDATE chat_sessions SET name = COALESCE(NULLIF($2, ''), name), email = COALESCE(NULLIF($3, ''), email) WHERE id = $1`, [s.id, str(body.name, 100), email]);
    return send(res, 200, { ok: true });
  }

  if (action === 'end') {
    if (s.status === 'open') {
      await query(`UPDATE chat_sessions SET status = 'closed', closed_at = now() WHERE id = $1`, [s.id]);
      await query(`INSERT INTO chat_messages (session_id, sender, body) VALUES ($1, 'system', 'Visitor ended the chat')`, [s.id]);
    }
    return send(res, 200, { ok: true });
  }

  if (action === 'rate') {
    const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : '';
    if (!rating) throw new HttpError(400, 'Unknown rating.');
    await query(`UPDATE chat_sessions SET rating = $2 WHERE id = $1`, [s.id, rating]);
    return send(res, 200, { ok: true });
  }

  throw new HttpError(400, 'Unknown action.');
});
