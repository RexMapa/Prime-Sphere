// Client side of /api/auth (scope=client). Kept in lib/ so it doesn't use up a Vercel function.
//
// GET  /api/auth?scope=client                        -> the signed-in client's account and status
// POST /api/auth?scope=client&action=login           { email, password }
// POST /api/auth?scope=client&action=logout
// POST /api/auth?scope=client&action=set-password    { password }            first sign-in (or any time)
// POST /api/auth?scope=client&action=save            { onboarding }          save a draft
// POST /api/auth?scope=client&action=submit          { onboarding }          send for admin approval
// POST /api/auth?scope=client&action=proof           raw image body          proof of payment
import { put } from '@vercel/blob';
import { db } from './db.js';
import { send, readJson, readRaw, ipHash, requireFetchHeader, HttpError } from './http.js';
import { hashPassword } from './auth.js';
import { removeBlobs } from './blob.js';
import {
  ensureClientSchema, getClient, requireClient, clientLogin, setClientSession, clearClientSession,
  checkClientPassword, toClientSelf, cleanOnboarding, missingFields
} from './clients.js';

const MAX_FAILS = 8;
const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID_READ_WRITE_TOKEN;
const LIMIT = 4.4 * 1024 * 1024;

export async function handleClient(req, res, action) {
  await ensureClientSchema();
  const { query } = db();

  if (req.method === 'GET') {
    const c = await getClient(req);
    if (!c) return send(res, 401, { error: 'Not signed in.' });
    return send(res, 200, await toClientSelf(c));
  }
  requireFetchHeader(req);

  if (action === 'logout') {
    clearClientSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (action === 'login') {
    const { email, password } = await readJson(req);
    const ip = 'c|' + ipHash(req);
    await query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`);
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM login_attempts WHERE ip_hash = $1 AND created_at > now() - interval '15 minutes'`, [ip]);
    if (n >= MAX_FAILS) throw new HttpError(429, 'Too many failed sign-in attempts. Wait 15 minutes and try again.');
    const c = await clientLogin(email, password);
    if (!c) {
      await query(`INSERT INTO login_attempts (ip_hash) VALUES ($1)`, [ip]);
      await new Promise((r) => setTimeout(r, 400));
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    await query(`DELETE FROM login_attempts WHERE ip_hash = $1`, [ip]);
    setClientSession(req, res, c);
    return send(res, 200, await toClientSelf(c));
  }

  const me = await requireClient(req);

  if (action === 'set-password') {
    const { password } = await readJson(req);
    checkClientPassword(password);
    const rows = await query(
      `UPDATE clients SET password_hash = $2, password_version = password_version + 1, must_change_password = false,
         status = CASE WHEN status = 'invited' THEN 'onboarding' ELSE status END, updated_at = now()
       WHERE id = $1 RETURNING *`, [me.id, await hashPassword(password)]);
    setClientSession(req, res, rows[0]); // stay signed in here, other devices sign out
    return send(res, 200, await toClientSelf(rows[0]));
  }
  if (me.must_change_password) throw new HttpError(403, 'Set your own password first.');

  if (action === 'save' || action === 'submit') {
    if (me.status !== 'onboarding') throw new HttpError(409, 'Your onboarding details are already with our team.');
    const body = await readJson(req);
    const data = cleanOnboarding(body.onboarding);
    if (action === 'save') {
      await query(`UPDATE clients SET onboarding = $2::jsonb, updated_at = now() WHERE id = $1`, [me.id, JSON.stringify(data)]);
      return send(res, 200, { ok: true });
    }
    const missing = missingFields(data);
    if (missing.length) {
      const e = new HttpError(400, 'Some required answers are missing. Check the highlighted steps.');
      e.missing = missing;
      throw e;
    }
    const company = String(data.businessName || me.company || '').slice(0, 120);
    const rows = await query(
      `UPDATE clients SET onboarding = $2::jsonb, company = $3, status = 'review', submitted_at = now(), admin_note = '', updated_at = now()
       WHERE id = $1 RETURNING *`, [me.id, JSON.stringify(data), company]);
    return send(res, 200, await toClientSelf(rows[0]));
  }

  if (action === 'proof') {
    if (me.status !== 'payment') throw new HttpError(409, 'There is no payment waiting for proof right now.');
    if (!BLOB_TOKEN()) {
      const e = new HttpError(500, 'Uploads are not set up yet. Please send your screenshot to our team by email.');
      e.expose = true;
      throw e;
    }
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!TYPES[type]) throw new HttpError(415, 'Upload a JPG, PNG or WebP screenshot.');
    const buf = await readRaw(req, LIMIT);
    if (!buf.length) throw new HttpError(400, 'The file is empty.');
    const blob = await put(`payments/proof-client-${me.id}.${TYPES[type]}`, buf, { access: 'public', contentType: type, addRandomSuffix: true, token: BLOB_TOKEN() });
    if (me.proof_url) await removeBlobs([me.proof_url]);
    const rows = await query(
      `UPDATE clients SET proof_url = $2, proof_uploaded_at = now(), status = 'payment_review', admin_note = '', updated_at = now()
       WHERE id = $1 RETURNING *`, [me.id, blob.url]);
    return send(res, 200, await toClientSelf(rows[0]));
  }

  throw new HttpError(400, 'Unknown action.');
}
