// Admin: manage Shopify stores.
// GET                         - all stores (including hidden)
// POST   { store fields }     - create
// PUT    { id, store fields } - update
// PATCH  { order: [ids] }     - reorder
// DELETE ?id=123              - delete (also removes uploaded screenshots)
import { db, ensureSchema } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { validateStore } from '../../lib/stores.js';
import { removeBlobs } from '../../lib/blob.js';

function toJson(r) {
  return {
    id: r.id, name: r.name, category: r.category, url: r.url, pages: r.pages || [],
    featured: r.featured, published: r.published, sortOrder: r.sort_order, updatedAt: r.updated_at
  };
}

export default route(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], async (req, res) => {
  await requireAdmin(req);
  await ensureSchema();
  const { query } = db();

  if (req.method === 'GET') {
    const rows = await query(`SELECT * FROM stores ORDER BY sort_order, id`);
    return send(res, 200, { stores: rows.map(toJson) });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    const id = Number(new URL(req.url, 'http://x').searchParams.get('id'));
    if (!Number.isInteger(id)) throw new HttpError(400, 'Missing store id.');
    const rows = await query(`DELETE FROM stores WHERE id = $1 RETURNING pages`, [id]);
    if (!rows.length) throw new HttpError(404, 'Store not found.');
    await removeBlobs((rows[0].pages || []).map((p) => p.image));
    return send(res, 200, { ok: true });
  }

  const body = await readJson(req);

  if (req.method === 'PATCH') {
    const order = (Array.isArray(body.order) ? body.order : []).map(Number).filter(Number.isInteger);
    if (!order.length) throw new HttpError(400, 'Nothing to reorder.');
    await query(
      `UPDATE stores s SET sort_order = o.ord FROM unnest($1::int[]) WITH ORDINALITY AS o(id, ord) WHERE s.id = o.id`,
      [order]
    );
    return send(res, 200, { ok: true });
  }

  const s = validateStore(body);

  if (req.method === 'POST') {
    const rows = await query(
      `INSERT INTO stores (name, category, url, pages, featured, published, sort_order)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM stores))
       RETURNING *`,
      [s.name, s.category, s.url, JSON.stringify(s.pages), s.featured, s.published]
    );
    return send(res, 201, { store: toJson(rows[0]) });
  }

  // PUT
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Missing store id.');
  const before = await query(`SELECT pages FROM stores WHERE id = $1`, [id]);
  if (!before.length) throw new HttpError(404, 'Store not found.');
  const rows = await query(
    `UPDATE stores SET name = $1, category = $2, url = $3, pages = $4::jsonb, featured = $5, published = $6, updated_at = now()
     WHERE id = $7 RETURNING *`,
    [s.name, s.category, s.url, JSON.stringify(s.pages), s.featured, s.published, id]
  );
  // Remove screenshots that were replaced or deleted in this edit.
  const kept = new Set(s.pages.map((p) => p.image));
  await removeBlobs((before[0].pages || []).map((p) => p.image).filter((u) => !kept.has(u)));
  send(res, 200, { store: toJson(rows[0]) });
});
