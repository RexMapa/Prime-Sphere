// POST /api/contact  (public) - saves a contact form submission.
import { db, ensureSchema } from '../lib/db.js';
import { route, send, readJson, ipHash, HttpError, str } from '../lib/http.js';

const DISCUSS = ['Website Design & Development', 'Digital Marketing', 'SEO', 'Asset Creation', 'Paid Social Media', 'Others'];
const BUDGETS = ['<$5K', '$5K - $10K', '$10K - $50K', '$50K+'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default route(['POST'], async (req, res) => {
  const body = await readJson(req);

  // Honeypot: real visitors never fill this hidden field. Pretend success for bots.
  if (str(body.website, 200)) return send(res, 200, { ok: true });

  const data = {
    firstName: str(body.firstName, 100),
    lastName: str(body.lastName, 100),
    company: str(body.company, 150),
    helpWith: str(body.helpWith, 2000),
    discuss: (Array.isArray(body.discuss) ? body.discuss : [body.discuss]).map((d) => str(d, 60)).filter((d) => DISCUSS.includes(d)),
    budget: str(body.budget, 20),
    email: str(body.email, 200),
    phone: str(body.phone, 40)
  };

  if (!data.firstName) throw new HttpError(400, 'Enter your first name.');
  if (!data.lastName) throw new HttpError(400, 'Enter your last name.');
  if (!data.discuss.length) throw new HttpError(400, 'Choose at least one topic.');
  if (!BUDGETS.includes(data.budget)) throw new HttpError(400, 'Choose a monthly budget.');
  if (!EMAIL_RE.test(data.email)) throw new HttpError(400, 'Enter an email like name@company.com.');
  if (data.phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Enter a phone number with at least 7 digits.');

  await ensureSchema();
  const { query } = db();
  const ip = ipHash(req);

  const [{ n }] = await query(`SELECT count(*)::int AS n FROM submissions WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'`, [ip]);
  if (n >= 5) throw new HttpError(429, 'Too many messages from this connection. Try again in 10 minutes.');

  await query(
    `INSERT INTO submissions (first_name, last_name, company, help_with, discuss, budget, email, phone, ip_hash)
     VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9)`,
    [data.firstName, data.lastName, data.company, data.helpWith, data.discuss, data.budget, data.email, data.phone, ip]
  );
  send(res, 201, { ok: true });
});
