// Public contact endpoint.
// POST                      { kind: 'message', ...fields }   contact form
// POST                      { kind: 'booking', ...fields }   book a call
// GET  ?availability=1      -> booking settings + taken slots
import { db, ensureSchema } from '../lib/db.js';
import { route, send, readJson, ipHash, HttpError, str } from '../lib/http.js';
import { getBooking, zonedToUtc, weekdayOf, validTimezone } from '../lib/booking.js';

const DISCUSS = ['Website Design & Development', 'Digital Marketing', 'SEO', 'Asset Creation', 'Paid Social Media', 'Others'];
const BUDGETS = ['<$5K', '$5K - $10K', '$10K - $50K', '$50K+'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function common(body) {
  const d = {
    firstName: str(body.firstName, 100),
    lastName: str(body.lastName, 100),
    company: str(body.company, 150),
    helpWith: str(body.helpWith, 2000),
    discuss: (Array.isArray(body.discuss) ? body.discuss : [body.discuss]).map((x) => str(x, 60)).filter((x) => DISCUSS.includes(x)),
    budget: str(body.budget, 20),
    email: str(body.email, 200),
    phone: str(body.phone, 40)
  };
  if (!d.firstName) throw new HttpError(400, 'Enter your first name.');
  if (!d.lastName) throw new HttpError(400, 'Enter your last name.');
  if (!d.discuss.length) throw new HttpError(400, 'Choose at least one topic.');
  if (!EMAIL_RE.test(d.email)) throw new HttpError(400, 'Enter an email like name@company.com.');
  if (d.phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Enter a phone number with at least 7 digits.');
  return d;
}

export default route(['GET', 'POST'], async (req, res) => {
  await ensureSchema();
  const { query } = db();

  if (req.method === 'GET') {
    const b = await getBooking(query);
    const taken = await query(
      `SELECT starts_at FROM submissions WHERE kind = 'booking' AND status <> 'cancelled' AND starts_at > now() AND starts_at < now() + make_interval(days => $1::int)`,
      [b.daysAhead + 1]
    );
    return send(res, 200, {
      booking: { enabled: b.enabled, timezone: b.timezone, days: b.days, slots: b.slots, duration: b.duration, daysAhead: b.daysAhead, minNoticeHours: b.minNoticeHours },
      taken: taken.map((r) => new Date(r.starts_at).toISOString()),
      now: new Date().toISOString()
    });
  }

  const body = await readJson(req);
  if (str(body.website, 200)) return send(res, 200, { ok: true }); // spam trap

  const ip = ipHash(req);
  const [{ n }] = await query(`SELECT count(*)::int AS n FROM submissions WHERE ip_hash = $1 AND created_at > now() - interval '10 minutes'`, [ip]);
  if (n >= 5) throw new HttpError(429, 'Too many requests from this connection. Try again in 10 minutes.');

  const d = common(body);

  if (body.kind !== 'booking') {
    if (!BUDGETS.includes(d.budget)) throw new HttpError(400, 'Choose a monthly budget.');
    await query(
      `INSERT INTO submissions (kind, first_name, last_name, company, help_with, discuss, budget, email, phone, ip_hash)
       VALUES ('message', $1, $2, $3, $4, $5::text[], $6, $7, $8, $9)`,
      [d.firstName, d.lastName, d.company, d.helpWith, d.discuss, d.budget, d.email, d.phone, ip]
    );
    return send(res, 201, { ok: true });
  }

  // ---- Booking ----
  const b = await getBooking(query);
  if (!b.enabled) throw new HttpError(409, 'Call booking is paused right now. Send us a message instead.');
  const date = str(body.date, 10);
  const time = str(body.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Choose a date.');
  if (!b.slots.includes(time)) throw new HttpError(400, 'Choose one of the available times.');
  if (!b.days.includes(weekdayOf(date))) throw new HttpError(400, 'We do not take calls on that day. Choose another date.');
  const starts = zonedToUtc(date, time, b.timezone);
  const now = Date.now();
  if (starts.getTime() < now + b.minNoticeHours * 3600e3) throw new HttpError(400, `Calls need to be booked at least ${b.minNoticeHours} hours ahead. Choose a later time.`);
  if (starts.getTime() > now + (b.daysAhead + 1) * 86400e3) throw new HttpError(400, `You can book up to ${b.daysAhead} days ahead. Choose an earlier date.`);
  const visitorTz = validTimezone(str(body.visitorTz, 64)) ? str(body.visitorTz, 64) : '';
  if (d.budget && !BUDGETS.includes(d.budget)) d.budget = '';

  try {
    await query(
      `INSERT INTO submissions (kind, first_name, last_name, company, help_with, discuss, budget, email, phone, ip_hash,
                                call_date, call_time, starts_at, timezone, visitor_tz, duration)
       VALUES ('booking', $1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [d.firstName, d.lastName, d.company, d.helpWith, d.discuss, d.budget, d.email, d.phone, ip,
       date, time, starts.toISOString(), b.timezone, visitorTz, b.duration]
    );
  } catch (e) {
    if (e.code === '23505' || /duplicate key|unique/i.test(e.message)) throw new HttpError(409, 'Someone just booked that time. Pick another time.');
    throw e;
  }
  send(res, 201, { ok: true, startsAt: starts.toISOString(), duration: b.duration });
});
