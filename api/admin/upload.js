// POST /api/admin/upload?filename=home.webp  (raw image body) -> { url }
// Stores screenshots in Vercel Blob. The admin page shrinks big images before sending.
import { put } from '@vercel/blob';
import { route, send, readRaw, requireFetchHeader, HttpError } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const LIMIT = 4.4 * 1024 * 1024; // Vercel functions accept bodies up to 4.5 MB

export default route(['POST'], async (req, res) => {
  await requireAdmin(req);
  requireFetchHeader(req);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const e = new HttpError(500, 'Image uploads need a Vercel Blob store. In Vercel, open Storage, create a Blob store and connect it to this project, then redeploy.');
    e.expose = true;
    throw e;
  }
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!TYPES[type]) throw new HttpError(415, 'Upload a JPG, PNG or WebP image.');
  const buf = await readRaw(req, LIMIT);
  if (!buf.length) throw new HttpError(400, 'The file is empty.');

  const base = String(new URL(req.url, 'http://x').searchParams.get('filename') || 'screenshot')
    .toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'screenshot';
  const folder = new URL(req.url, 'http://x').searchParams.get('folder') === 'content' ? 'content' : 'stores';
  const blob = await put(`${folder}/${base}.${TYPES[type]}`, buf, { access: 'public', contentType: type, addRandomSuffix: true });
  send(res, 201, { url: blob.url });
});
