// Small helpers shared by every API route.
import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!headers['Cache-Control']) res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

// Wraps a route: method check, errors become clean JSON responses.
export function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'Method not allowed');
      }
      await fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      send(res, status, { error: status >= 500 && !err.expose ? 'Something went wrong on the server. Try again.' : err.message });
    }
  };
}

export async function readJson(req) {
  let body;
  try { body = req.body; } catch { throw new HttpError(400, 'Request body is not valid JSON.'); }
  if (body == null || body === '') return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw new HttpError(400, 'Request body is not valid JSON.'); }
  }
  if (Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'Request body is not valid JSON.'); }
  }
  return body;
}

// Reads the raw request body without parsing (used for image uploads).
export async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `File is too large. Maximum is ${Math.floor(limit / 1024 / 1024)} MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// IPs are stored hashed, never in plain text.
export function ipHash(req) {
  return createHash('sha256').update((process.env.SESSION_SECRET || '') + '|' + clientIp(req)).digest('hex').slice(0, 32);
}

// Blocks cross-site requests to admin endpoints: browsers cannot send this
// custom header from another site without a CORS preflight, which we never allow.
export function requireFetchHeader(req) {
  if (req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'Forbidden');
}

export function str(v, max) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}
