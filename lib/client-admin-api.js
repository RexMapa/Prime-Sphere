// Admin side of client accounts, served by /api/admin/users (to stay under Vercel's function limit).
//
// ?scope=clients
//   GET                                   -> { clients, counts, methods }
//   POST   { name, email, company }       -> invite: { client, tempPassword }
//   PATCH  { id, action, ... }            actions:
//            approve        { methodIds, amount, currency, note }  approve onboarding + send payment request
//            update-invoice { methodIds, amount, currency, note }  change a payment request already sent
//            changes        { note }                               send onboarding back for changes
//            confirm                                               payment received -> client is active
//            reject-proof   { note }                               ask for a new screenshot
//            reset-password                                        new temporary password: { tempPassword }
//            disable / enable
//   DELETE ?id=
// ?scope=payment-methods
//   GET -> { methods }   POST { label, accountName, accountNumber, image, active }
//   PATCH { id, ...same fields, move: 'up'|'down' }   DELETE ?id=
import { db } from './db.js';
import { send, readJson, requireFetchHeader, HttpError, str } from './http.js';
import { hashPassword } from './auth.js';
import { removeBlobs } from './blob.js';
import { ensureClientSchema, toClientAdmin, toMethod, tempPassword, CURRENCIES } from './clients.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleClientsAdmin(req, res, me, scope) {
  await ensureClientSchema();
  const { query } = db();
  const url = new URL(req.url, 'http://x');
  const adminName = me.name || me.email;

  if (scope === 'payment-methods') return paymentMethods(req, res, query, url);

  if (req.method === 'GET') {
    const rows = await query(`SELECT * FROM clients ORDER BY
      CASE status WHEN 'review' THEN 0 WHEN 'payment_review' THEN 1 ELSE 2 END, updated_at DESC, id DESC`);
    const methods = await query(`SELECT * FROM payment_methods ORDER BY sort_order, id`);
    const counts = { all: rows.length };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    counts.needsAction = (counts.review || 0) + (counts.payment_review || 0);
    return send(res, 200, { clients: rows.map(toClientAdmin), counts, methods: methods.map(toMethod) });
  }

  requireFetchHeader(req);

  if (req.method === 'DELETE') {
    const id = Number(url.searchParams.get('id'));
    const rows = await query(`DELETE FROM clients WHERE id = $1 RETURNING proof_url`, [id]);
    if (!rows.length) throw new HttpError(404, 'Client not found.');
    await removeBlobs([rows[0].proof_url]);
    return send(res, 200, { ok: true });
  }

  const body = await readJson(req);

  if (req.method === 'POST') {
    const name = str(body.name, 80);
    const email = str(body.email, 200).toLowerCase();
    const company = str(body.company, 120);
    if (!name) throw new HttpError(400, "Enter the client's name.");
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const exists = await query(`SELECT 1 FROM clients WHERE email = $1`, [email]);
    if (exists.length) throw new HttpError(409, 'A client with that email already exists. Use Reset password to send them a new one.');
    const pw = tempPassword();
    const rows = await query(
      `INSERT INTO clients (email, name, company, password_hash, invited_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email, name, company, await hashPassword(pw), adminName]);
    return send(res, 201, { client: toClientAdmin(rows[0]), tempPassword: pw });
  }

  // PATCH
  const id = Number(body.id);
  const found = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
  if (!found.length) throw new HttpError(404, 'Client not found.');
  const c = found[0];
  const action = String(body.action || '');
  let rows;
  let extra = {};

  const readInvoice = async () => {
    const amount = Math.round(Number(String(body.amount ?? '').replace(/,/g, '')) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter the amount the client needs to pay.');
    if (amount > 100000000) throw new HttpError(400, 'That amount looks too large.');
    const currency = CURRENCIES.includes(body.currency) ? body.currency : 'USD';
    const ids = (Array.isArray(body.methodIds) ? body.methodIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) throw new HttpError(400, 'Select at least one QR code for the client to pay with.');
    const ok = await query(`SELECT id FROM payment_methods WHERE id = ANY($1::int[]) AND active`, [ids]);
    if (ok.length !== new Set(ids).size) throw new HttpError(400, 'One of the selected QR codes is hidden or was deleted. Refresh and try again.');
    return { amount, currency, methodIds: [...new Set(ids)], note: str(body.note, 1000), sentAt: new Date().toISOString(), sentBy: adminName };
  };

  if (action === 'approve') {
    if (c.status !== 'review') throw new HttpError(409, 'This client is not waiting for onboarding approval.');
    const inv = await readInvoice();
    rows = await query(
      `UPDATE clients SET status = 'payment', invoice = $2::jsonb, approved_at = now(), approved_by = $3, admin_note = '', updated_at = now()
       WHERE id = $1 RETURNING *`, [id, JSON.stringify(inv), adminName]);
  } else if (action === 'update-invoice') {
    if (c.status !== 'payment' && c.status !== 'payment_review') throw new HttpError(409, 'There is no open payment request for this client.');
    const inv = await readInvoice();
    rows = await query(`UPDATE clients SET invoice = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`, [id, JSON.stringify(inv)]);
  } else if (action === 'changes') {
    if (c.status !== 'review') throw new HttpError(409, 'This client is not waiting for onboarding approval.');
    const note = str(body.note, 1000);
    if (!note) throw new HttpError(400, 'Tell the client what to change.');
    rows = await query(`UPDATE clients SET status = 'onboarding', admin_note = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, note]);
  } else if (action === 'confirm') {
    if (c.status !== 'payment_review') throw new HttpError(409, 'This client has no payment waiting for confirmation.');
    rows = await query(
      `UPDATE clients SET status = 'active', paid_at = now(), confirmed_by = $2, admin_note = '', updated_at = now() WHERE id = $1 RETURNING *`,
      [id, adminName]);
  } else if (action === 'reject-proof') {
    if (c.status !== 'payment_review') throw new HttpError(409, 'This client has no payment waiting for confirmation.');
    const note = str(body.note, 1000);
    if (!note) throw new HttpError(400, 'Tell the client what was wrong with the payment.');
    rows = await query(`UPDATE clients SET status = 'payment', admin_note = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, note]);
  } else if (action === 'reset-password') {
    const pw = tempPassword();
    rows = await query(
      `UPDATE clients SET password_hash = $2, password_version = password_version + 1, must_change_password = true, updated_at = now()
       WHERE id = $1 RETURNING *`, [id, await hashPassword(pw)]);
    extra = { tempPassword: pw };
  } else if (action === 'disable' || action === 'enable') {
    const on = action === 'enable';
    rows = await query(
      `UPDATE clients SET active = $2, password_version = password_version + CASE WHEN $2 THEN 0 ELSE 1 END, updated_at = now()
       WHERE id = $1 RETURNING *`, [id, on]);
  } else {
    throw new HttpError(400, 'Unknown action.');
  }
  return send(res, 200, { client: toClientAdmin(rows[0]), ...extra });
}

async function paymentMethods(req, res, query, url) {
  if (req.method === 'GET') {
    const rows = await query(`SELECT * FROM payment_methods ORDER BY sort_order, id`);
    return send(res, 200, { methods: rows.map(toMethod) });
  }
  requireFetchHeader(req);
  if (req.method === 'DELETE') {
    const id = Number(url.searchParams.get('id'));
    const rows = await query(`DELETE FROM payment_methods WHERE id = $1 RETURNING image_url`, [id]);
    if (!rows.length) throw new HttpError(404, 'QR code not found.');
    // Keep the image if a sent payment request still points at it? Requests resolve methods live,
    // so a deleted method simply disappears from them; the image can go.
    await removeBlobs([rows[0].image_url]);
    return send(res, 200, { ok: true });
  }
  const body = await readJson(req);
  const fields = () => {
    const label = str(body.label, 60);
    if (!label) throw new HttpError(400, 'Name this QR code, for example GCash or BPI.');
    const image = str(body.image, 1000);
    if (!image) throw new HttpError(400, 'Upload the QR code image.');
    return [label, str(body.accountName, 120), str(body.accountNumber, 80), image, body.active !== false];
  };
  if (req.method === 'POST') {
    const [{ n }] = await query(`SELECT COALESCE(max(sort_order), -1) + 1 AS n FROM payment_methods`);
    const rows = await query(
      `INSERT INTO payment_methods (label, account_name, account_number, image_url, active, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [...fields(), n]);
    return send(res, 201, { method: toMethod(rows[0]) });
  }
  // PATCH
  const id = Number(body.id);
  const found = await query(`SELECT * FROM payment_methods WHERE id = $1`, [id]);
  if (!found.length) throw new HttpError(404, 'QR code not found.');
  if (body.move === 'up' || body.move === 'down') {
    const all = await query(`SELECT id FROM payment_methods ORDER BY sort_order, id`);
    const ids = all.map((r) => r.id);
    const i = ids.indexOf(id);
    const j = body.move === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; }
    for (let k = 0; k < ids.length; k++) await query(`UPDATE payment_methods SET sort_order = $2 WHERE id = $1`, [ids[k], k]);
    return send(res, 200, { ok: true });
  }
  if (body.active !== undefined && body.label === undefined) {
    const rows = await query(`UPDATE payment_methods SET active = $2 WHERE id = $1 RETURNING *`, [id, !!body.active]);
    return send(res, 200, { method: toMethod(rows[0]) });
  }
  const f = fields();
  const old = found[0].image_url;
  const rows = await query(
    `UPDATE payment_methods SET label = $2, account_name = $3, account_number = $4, image_url = $5, active = $6 WHERE id = $1 RETURNING *`,
    [id, ...f]);
  if (old && old !== f[3]) await removeBlobs([old]);
  return send(res, 200, { method: toMethod(rows[0]) });
}
