// GET /api/stores           (public) - all published stores
// GET /api/stores?featured=1             - featured stores for the homepage (max 5)
import { db, ensureSchema } from '../lib/db.js';
import { route, send } from '../lib/http.js';
import { toPublic } from '../lib/stores.js';

export default route(['GET'], async (req, res) => {
  await ensureSchema();
  const featured = new URL(req.url, 'http://x').searchParams.get('featured') === '1';
  const rows = await db().query(
    featured
      ? `SELECT * FROM stores WHERE published AND featured ORDER BY sort_order, id LIMIT 5`
      : `SELECT * FROM stores WHERE published ORDER BY sort_order, id`
  );
  // Cached at Vercel's edge for 30s, so admin changes appear within about half a minute.
  send(res, 200, { stores: rows.map(toPublic) }, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' });
});
