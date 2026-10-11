import { clientChat } from './client-chat.js';
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

  if (action === 'support-team') {
    const client = await requireClient(req);
    if (client.must_change_password || client.status !== 'active') throw new HttpError(403, 'Chat is available for active clients.');
    const members = await query("SELECT id, COALESCE(NULLIF(name, ''), 'Team member') AS name FROM admins WHERE active ORDER BY name, id");
    return send(res, 200, { members });
  }
  if (action === 'support-chat') {
    const client = await requireClient(req);
    if (client.must_change_password || client.status !== 'active') throw new HttpError(403, 'Chat is available for active clients.');
    return clientChat(req, res, client.id, 'client', client.name);
  }

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


  if (action === 'access-save') {
    if (me.status !== 'active') throw new HttpError(409, 'Access requests are available after payment is confirmed.');
    const body = await readJson(req);
    const definitions = {"shopify":[{"key":"store","label":"Your website or store name","type":"text","required":true},{"key":"code","label":"Collaborator request code","type":"text","required":true}],"domain":[{"key":"domain","label":"Primary domain (your website URL)","type":"text","required":true},{"key":"registrar","label":"Where the domain was purchased","type":"select","required":true,"options":["Cloudflare","GoDaddy","Namecheap","Google / Squarespace","Shopify","Other","Unsure"]},{"key":"manager","label":"Who manages DNS right now","type":"select","required":true,"options":["Me","My team","Developer / agency","Other","Unsure"]},{"key":"email","label":"Business email provider","type":"select","required":true,"options":["Google Workspace","Microsoft 365","Zoho Mail","Other","None","Unsure"]}],"googleAds":[{"key":"account","label":"Google Ads account ID","type":"text","required":true},{"key":"confirmed","label":"Confirm you have provided your Google Ads account ID","type":"select","required":true,"options":["Yes","No","Unsure"]}],"merchant":[{"key":"account","label":"Google Merchant Center account ID","type":"text","required":true},{"key":"invited","label":"Confirm you have invited our team with Admin access","type":"select","required":true,"options":["Yes","No","Unsure"]}],"searchConsole":[{"key":"property","label":"Google Search Console property URL","type":"text","required":true},{"key":"invited","label":"Confirm you have invited our team with Full access","type":"select","required":true,"options":["Yes","No","Unsure"]}],"meta":[{"key":"business","label":"Meta Business Manager ID (if known)","type":"text","required":false},{"key":"facebook","label":"Facebook Page URL","type":"text","required":false},{"key":"instagram","label":"Instagram handle","type":"text","required":false},{"key":"adAccount","label":"Meta Ad Account ID (if known)","type":"text","required":false},{"key":"pixel","label":"Meta Pixel ID (if known)","type":"text","required":false},{"key":"invited","label":"Confirm you have added our team with the agreed access","type":"select","required":true,"options":["Yes","No","Unsure"]}],"klaviyo":[{"key":"exists","label":"Do you already have a Klaviyo account?","type":"select","required":true,"options":["Yes","No","Unsure"]},{"key":"invited","label":"Confirm you have invited our team as Admin","type":"select","required":false,"options":["Yes","No","Unsure"]}],"tracking":[{"key":"clarity","label":"Is Microsoft Clarity currently installed?","type":"select","required":true,"options":["Yes","No","Unsure"]},{"key":"analytics","label":"Is Google Analytics (GA4) installed?","type":"select","required":true,"options":["Yes","No","Unsure"]},{"key":"measurement","label":"GA4 measurement ID (if known)","type":"text","required":false},{"key":"container","label":"Google Tag Manager container ID (if known)","type":"text","required":false}],"reviews":[{"key":"app","label":"Reviews app currently installed in Shopify","type":"text","required":false},{"key":"location","label":"Where your best reviews currently live","type":"text","required":false},{"key":"photos","label":"Do you have before and after photos or results you are comfortable sharing?","type":"select","required":false,"options":["Yes","No","Unsure"]},{"key":"claims","label":"Claims to avoid unless you can provide proof","type":"textarea","required":false}],"sms":[{"key":"provider","label":"Current SMS provider","type":"select","required":true,"options":["None","Klaviyo","Attentive","Postscript","SMSBump / Yotpo","Other","Unsure"]},{"key":"granted","label":"Access to SMS platform granted","type":"select","required":false,"options":["Yes","No","Unsure"]}]};
    const fields = definitions[body.id];
    if (!Object.hasOwn(definitions, body.id) || !Array.isArray(fields) || !['completed', 'help'].includes(body.status)) throw new HttpError(400, 'Invalid access request.');
    const values = {};
    for (const field of fields) {
      const value = typeof body.values?.[field.key] === 'string' ? body.values[field.key].trim().slice(0, 4000) : '';
      if (field.type === 'select' && value && !field.options.includes(value)) throw new HttpError(400, 'Choose a valid option for ' + field.label);
      if (body.status === 'completed' && field.required && !value) throw new HttpError(400, 'Complete ' + field.label);
      values[field.key] = value;
    }
    if (body.status === 'completed' && body.id === 'googleAds' && !/^[0-9]{3}-?[0-9]{3}-?[0-9]{4}$/.test(values.account)) throw new HttpError(400, 'Enter a ten-digit Google Ads customer ID.');
    if (body.status === 'completed' && body.id === 'shopify' && !/^[0-9]{4}$/.test(values.code)) throw new HttpError(400, 'Enter a four-digit collaborator code.');
    const request = { values, status: body.status, updatedAt: new Date().toISOString() };
    await query(`UPDATE clients SET onboarding = jsonb_set(COALESCE(onboarding, '{}'::jsonb), '{accessRequests}', COALESCE(onboarding->'accessRequests', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)), updated_at = now() WHERE id = $1`, [me.id, body.id, JSON.stringify(request)]);
    if (body.status === 'help' && me.onboarding?.accessRequests?.[body.id]?.status !== 'help') {
      await query("INSERT INTO client_messages (client_id, sender, sender_name, body, request_id) VALUES ($1, 'system', 'Access help', $2, $3)", [me.id, 'Help requested: ' + ({shopify:'Shopify Store Access',domain:'Domain, DNS, and Business Email',googleAds:'Google Ads',merchant:'Merchant Center',searchConsole:'Search Console',meta:'Meta Business Suite',klaviyo:'Klaviyo',tracking:'Clarity and Tracking',reviews:'Reviews and Trust',sms:'SMS Marketing'}[body.id] || body.id), body.id]);
    }
    return send(res, 200, { request });
  }

  if (action === 'brand-upload') {
    if (me.status !== 'onboarding') throw new HttpError(409, 'Uploads are only available during onboarding.');
    if (!BLOB_TOKEN()) throw new HttpError(400, 'Uploads are not configured. Use an asset folder link instead.');
    const types = { ...TYPES, 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!types[type]) throw new HttpError(415, 'Choose an image, PDF or Word document.');
    const buf = await readRaw(req, 4 * 1024 * 1024);
    if (!buf.length) throw new HttpError(400, 'The file is empty.');
    const blob = await put('brands/client-' + me.id + '/asset.' + types[type], buf, { access: 'public', contentType: type, addRandomSuffix: true, token: BLOB_TOKEN() });
    return send(res, 200, { url: blob.url });
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
