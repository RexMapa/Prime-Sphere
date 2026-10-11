import { db } from './db.js';
import { readJson, send, requireFetchHeader, HttpError, str } from './http.js';
export async function clientChat(req, res, clientId, sender, name) {
  const { query } = db();
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    const rows = await query('SELECT id, sender, sender_name AS name, body, created_at AS "createdAt", seen FROM client_messages WHERE client_id = $1 ORDER BY id DESC LIMIT 200', [clientId]);
    return send(res, 200, { messages: rows.reverse() });
  }
  requireFetchHeader(req);
  const body = await readJson(req);
  if (body.action === 'read') {
    const through = Number(body.through);
    if (!Number.isSafeInteger(through) || through < 0) throw new HttpError(400, 'Invalid message ID.');
    await query('UPDATE client_messages SET seen = true WHERE client_id = $1 AND sender = $2 AND id <= $3', [clientId, sender === 'admin' ? 'client' : 'admin', through]);
    return send(res, 200, { ok: true });
  }
  const message = str(body.message, 2001);
  if (!message || message.length > 2000) throw new HttpError(400, 'Enter a message of up to 2000 characters.');
  const [rate] = await query("SELECT count(*)::int AS n FROM client_messages WHERE client_id = $1 AND sender = $2 AND created_at > now() - interval '1 minute'", [clientId, sender]);
  if (rate.n >= 20) throw new HttpError(429, 'Please wait before sending more messages.');
  const [out] = await query('INSERT INTO client_messages (client_id, sender, sender_name, body) VALUES ($1, $2, $3, $4) RETURNING id', [clientId, sender, name, message]);
  await query('UPDATE clients SET updated_at = now() WHERE id = $1', [clientId]);
  return send(res, 201, { id: out.id });
}
