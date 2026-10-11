import { put } from '@vercel/blob';
import { db } from './db.js';
import { readJson, readRaw, send, requireFetchHeader, HttpError, str } from './http.js';
export async function clientChat(req, res, clientId, sender, name) {
  const { query } = db();
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    const rows = await query('SELECT id, sender, sender_name AS name, body, attachment, created_at AS "createdAt", seen FROM client_messages WHERE client_id = $1 ORDER BY id DESC LIMIT 200', [clientId]);
    return send(res, 200, { messages: rows.reverse() });
  }
  requireFetchHeader(req);
  if (url.searchParams.get('upload') === '1') {
    const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID_READ_WRITE_TOKEN;
    if (!token) throw new HttpError(400, 'File uploads are not configured. Contact your account manager.');
    const types = {
      'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif',
      'video/mp4':'mp4', 'video/webm':'webm', 'video/quicktime':'mov',
      'audio/mpeg':'mp3', 'audio/mp4':'m4a', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/ogg':'ogg', 'audio/webm':'webm',
      'application/pdf':'pdf', 'text/plain':'txt', 'text/csv':'csv',
      'application/msword':'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
      'application/vnd.ms-excel':'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
      'application/vnd.ms-powerpoint':'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx'
    };
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!Object.hasOwn(types, type)) throw new HttpError(415, 'Choose an image, video, audio file, PDF or Office document.');
    const [rate] = await query("SELECT count(*)::int AS n FROM client_messages WHERE client_id = $1 AND sender = $2 AND created_at > now() - interval '1 minute'", [clientId, sender]);
    if (rate.n >= 20) throw new HttpError(429, 'Please wait before sending more files.');
    const buf = await readRaw(req, 4 * 1024 * 1024);
    if (!buf.length) throw new HttpError(400, 'The file is empty.');
    const filename = str(url.searchParams.get('filename'), 180) || 'attachment.' + types[type];
    const blob = await put('support/client-' + clientId + '/attachment.' + types[type], buf, { access: 'public', contentType: type, addRandomSuffix: true, token });
    const attachment = { url: blob.url, name: filename, type, size: buf.length };
    const [out] = await query("INSERT INTO client_messages (client_id, sender, sender_name, body, attachment) VALUES ($1, $2, $3, '', $4::jsonb) RETURNING id", [clientId, sender, name, JSON.stringify(attachment)]);
    await query('UPDATE clients SET updated_at = now() WHERE id = $1', [clientId]);
    return send(res, 201, { id: out.id });
  }
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
