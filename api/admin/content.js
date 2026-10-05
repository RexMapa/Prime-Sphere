// Admin: homepage sections and booking settings.
// GET    ?type=project|service|testimonial|client|post|case|member   -> items (including hidden)
// GET    ?settings=booking
// POST   { type, data, published }
// PUT    { id, data, published }
// PUT    ?settings=booking  { ...settings }
// PATCH  { order: [ids] }
// DELETE ?id=12
import { db, ensureSchema } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { validate, IMAGE_FIELDS, TYPES } from '../../lib/content.js';
import { getBooking, cleanSettings } from '../../lib/booking.js';
import { getPromo, cleanPromo } from '../../lib/promo.js';
import { getWork, cleanWork } from '../../lib/work.js';
import { removeBlobs } from '../../lib/blob.js';

const toJson = (r) => ({ id: r.id, type: r.type, data: r.data, published: r.published, sortOrder: r.sort_order, updatedAt: r.updated_at });
const images = (type, data) => (IMAGE_FIELDS[type] || []).map((f) => data && data[f]).filter(Boolean);

export default route(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], async (req, res) => {
  await requireAdmin(req);
  await ensureSchema();
  const { query } = db();
  const params = new URL(req.url, 'http://x').searchParams;
  const isWork = params.get('settings') === 'work';
  const isPromo = params.get('settings') === 'promo';
  const isSettings = params.get('settings') === 'booking';

  if (req.method === 'GET') {
    if (isWork) return send(res, 200, { work: await getWork(query) });
    if (isPromo) return send(res, 200, { promo: await getPromo(query) });
    if (isSettings) return send(res, 200, { booking: await getBooking(query) });
    const type = params.get('type');
    if (!TYPES[type]) throw new HttpError(400, 'Unknown section.');
    const rows = await query(`SELECT * FROM content_items WHERE type = $1 ORDER BY sort_order, id`, [type]);
    return send(res, 200, { items: rows.map(toJson) });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    const id = Number(params.get('id'));
    const rows = await query(`DELETE FROM content_items WHERE id = $1 RETURNING type, data`, [id]);
    if (!rows.length) throw new HttpError(404, 'Item not found.');
    await removeBlobs(images(rows[0].type, rows[0].data));
    return send(res, 200, { ok: true });
  }

  const body = await readJson(req);

  if (isWork && req.method === 'PUT') {
    const value = cleanWork(body);
    await query(`INSERT INTO settings (key, value) VALUES ('work', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(value)]);
    return send(res, 200, { work: value });
  }

  if (isPromo && req.method === 'PUT') {
    const value = cleanPromo(body);
    await query(`INSERT INTO settings (key, value) VALUES ('promo', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(value)]);
    return send(res, 200, { promo: value });
  }

  if (isSettings && req.method === 'PUT') {
    const value = cleanSettings(body);
    await query(`INSERT INTO settings (key, value) VALUES ('booking', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(value)]);
    return send(res, 200, { booking: value });
  }

  if (req.method === 'PATCH') {
    const order = (Array.isArray(body.order) ? body.order : []).map(Number).filter(Number.isInteger);
    if (!order.length) throw new HttpError(400, 'Nothing to reorder.');
    await query(`UPDATE content_items c SET sort_order = o.ord FROM unnest($1::int[]) WITH ORDINALITY AS o(id, ord) WHERE c.id = o.id`, [order]);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST') {
    const data = validate(body.type, body.data);
    const rows = await query(
      `INSERT INTO content_items (type, data, published, sort_order)
       VALUES ($1, $2::jsonb, $3, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM content_items WHERE type = $1)) RETURNING *`,
      [body.type, JSON.stringify(data), body.published !== false]
    );
    return send(res, 201, { item: toJson(rows[0]) });
  }

  // PUT item
  const id = Number(body.id);
  const before = await query(`SELECT type, data FROM content_items WHERE id = $1`, [id]);
  if (!before.length) throw new HttpError(404, 'Item not found.');
  const type = before[0].type;
  const data = validate(type, body.data);
  const rows = await query(`UPDATE content_items SET data = $2::jsonb, published = $3, updated_at = now() WHERE id = $1 RETURNING *`, [id, JSON.stringify(data), body.published !== false]);
  const kept = new Set(images(type, data));
  await removeBlobs(images(type, before[0].data).filter((u) => !kept.has(u)));
  send(res, 200, { item: toJson(rows[0]) });
});
