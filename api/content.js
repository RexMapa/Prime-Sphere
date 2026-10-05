// GET /api/content          -> all published homepage sections (posts without their full text, team members included)
// GET /api/content?promo=1  -> the countdown offer (or null)
// GET /api/content?post=12  -> one published blog post with its full text
import { db, ensureSchema } from '../lib/db.js';
import { route, send, HttpError } from '../lib/http.js';
import { getPromo } from '../lib/promo.js';
import { getWork } from '../lib/work.js';

const CACHE = { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' };

export default route(['GET'], async (req, res) => {
  await ensureSchema();
  const { query } = db();
  if (new URL(req.url, 'http://x').searchParams.get('promo')) {
    const p = await getPromo(query);
    const live = p.enabled && p.endsAt && Date.parse(p.endsAt) > Date.now();
    return send(res, 200, { promo: live ? p : null, now: Date.now() }, { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' });
  }
  const postId = Number(new URL(req.url, 'http://x').searchParams.get('post'));

  if (postId) {
    const rows = await query(`SELECT id, data FROM content_items WHERE id = $1 AND type = 'post' AND published`, [postId]);
    if (!rows.length) throw new HttpError(404, 'That post is not available.');
    return send(res, 200, { post: { id: rows[0].id, ...rows[0].data } }, CACHE);
  }

  const rows = await query(`SELECT id, type, data FROM content_items WHERE published ORDER BY type, sort_order, id`);
  const out = { project: [], service: [], testimonial: [], client: [], post: [], case: [], member: [] };
  out.work = await getWork(query);
  rows.forEach((r) => {
    if (!out[r.type]) return;
    const item = { id: r.id, ...r.data };
    if (r.type === 'post') delete item.body;
    out[r.type].push(item);
  });
  out.post.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  send(res, 200, out, CACHE);
});
