// GET /api/promo -> { promo: {...} | null, now }   (null when off or already ended)
import { db, ensureSchema } from '../lib/db.js';
import { route, send } from '../lib/http.js';
import { getPromo } from '../lib/promo.js';

export default route(['GET'], async (req, res) => {
  await ensureSchema();
  const p = await getPromo(db().query);
  const live = p.enabled && p.endsAt && Date.parse(p.endsAt) > Date.now();
  send(res, 200, { promo: live ? p : null, now: Date.now() }, { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' });
});
