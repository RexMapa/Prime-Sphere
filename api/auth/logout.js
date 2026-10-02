// POST /api/auth/logout
import { route, send, requireFetchHeader } from '../../lib/http.js';
import { clearSession } from '../../lib/auth.js';

export default route(['POST'], async (req, res) => {
  requireFetchHeader(req);
  clearSession(req, res);
  send(res, 200, { ok: true });
});
