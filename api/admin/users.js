// Admin accounts (super admins only).
// GET                                     -> { admins }
// POST   { name, email, password, role }  -> create an admin
// PATCH  { id, name?, role?, active?, password? }
// DELETE ?id=<adminId>
import { db } from '../../lib/db.js';
import { route, send, readJson, requireFetchHeader, HttpError, str } from '../../lib/http.js';
import { requireSuper, toAdmin, hashPassword, checkPasswordRules, ROLES } from '../../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default route(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const me = await requireSuper(req);
  const { query } = db();

  if (req.method === 'GET') {
    const rows = await query(`SELECT * FROM admins ORDER BY is_owner DESC, active DESC, lower(name), id`);
    return send(res, 200, { admins: rows.map(toAdmin), me: me.id });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    const id = Number(new URL(req.url, 'http://x').searchParams.get('id'));
    const rows = await query(`SELECT * FROM admins WHERE id = $1`, [id]);
    if (!rows.length) throw new HttpError(404, 'Admin not found.');
    if (rows[0].is_owner) throw new HttpError(400, 'The owner account cannot be deleted.');
    if (rows[0].id === me.id) throw new HttpError(400, 'You cannot delete your own account.');
    await query(`UPDATE chat_sessions SET assigned_admin_id = NULL, assigned_name = '', assigned_at = NULL WHERE assigned_admin_id = $1`, [id]);
    await query(`DELETE FROM admins WHERE id = $1`, [id]);
    return send(res, 200, { ok: true });
  }

  const body = await readJson(req);

  if (req.method === 'POST') {
    const name = str(body.name, 60);
    const email = str(body.email, 200).toLowerCase();
    if (!name) throw new HttpError(400, 'Enter a name.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    checkPasswordRules(body.password);
    const role = ROLES.includes(body.role) ? body.role : 'admin';
    const exists = await query(`SELECT 1 FROM admins WHERE email = $1`, [email]);
    if (exists.length || email === (process.env.ADMIN_EMAIL || '').trim().toLowerCase()) throw new HttpError(409, 'An admin with that email already exists.');
    const rows = await query(
      `INSERT INTO admins (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING *`,
      [email, name, role, await hashPassword(body.password)]);
    return send(res, 201, { admin: toAdmin(rows[0]) });
  }

  // PATCH
  const id = Number(body.id);
  const rows = await query(`SELECT * FROM admins WHERE id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, 'Admin not found.');
  const a = rows[0];
  const isSelf = a.id === me.id;

  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (!name) throw new HttpError(400, 'Enter a name.');
    await query(`UPDATE admins SET name = $2 WHERE id = $1`, [id, name]);
    await query(`UPDATE chat_sessions SET assigned_name = $2 WHERE assigned_admin_id = $1`, [id, name]);
  }
  if (body.role !== undefined) {
    if (a.is_owner) throw new HttpError(400, 'The owner is always a super admin.');
    if (isSelf) throw new HttpError(400, 'You cannot change your own role.');
    if (!ROLES.includes(body.role)) throw new HttpError(400, 'Unknown role.');
    await query(`UPDATE admins SET role = $2 WHERE id = $1`, [id, body.role]);
  }
  if (body.active !== undefined) {
    if (a.is_owner) throw new HttpError(400, 'The owner account cannot be disabled.');
    if (isSelf) throw new HttpError(400, 'You cannot disable your own account.');
    const active = !!body.active;
    // Disabling signs them out everywhere (password_version changes) and frees their chats.
    await query(`UPDATE admins SET active = $2, password_version = password_version + CASE WHEN $2 THEN 0 ELSE 1 END WHERE id = $1`, [id, active]);
    if (!active) await query(`UPDATE chat_sessions SET assigned_admin_id = NULL, assigned_name = '', assigned_at = NULL WHERE assigned_admin_id = $1 AND status = 'open'`, [id]);
  }
  if (body.password) {
    if (a.is_owner) throw new HttpError(400, 'The owner password is set by ADMIN_PASSWORD in Vercel.');
    if (isSelf) throw new HttpError(400, 'Change your own password from My account.');
    checkPasswordRules(body.password);
    await query(`UPDATE admins SET password_hash = $2, password_version = password_version + 1 WHERE id = $1`, [id, await hashPassword(body.password)]);
  }
  const out = await query(`SELECT * FROM admins WHERE id = $1`, [id]);
  send(res, 200, { admin: toAdmin(out[0]) });
});
