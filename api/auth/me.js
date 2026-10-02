// GET /api/auth/me - tells the admin page whether you're signed in.
import { route, send } from '../../lib/http.js';
import { getSession } from '../../lib/auth.js';

export default route(['GET'], async (req, res) => {
  const s = getSession(req);
  if (!s) return send(res, 401, { error: 'Not signed in.' });
  send(res, 200, { email: s.sub });
});
