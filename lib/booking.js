// Booking settings and time-zone maths for "Book a call".
export const DEFAULT_BOOKING = {
  enabled: true,
  timezone: 'Asia/Manila',
  days: [1, 2, 3, 4, 5],           // 0 = Sunday ... 6 = Saturday
  slots: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'],
  duration: 30,                     // minutes
  daysAhead: 30,
  minNoticeHours: 12
};

export async function getBooking(query) {
  const rows = await query(`SELECT value FROM settings WHERE key = 'booking'`);
  return { ...DEFAULT_BOOKING, ...(rows[0] ? rows[0].value : {}) };
}

export function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Offset (ms) of a time zone at a given instant.
function tzOffset(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
}

// "2026-10-06" + "10:00" in "Asia/Manila" -> Date (UTC instant)
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffset(guess, tz);
  utc = guess - tzOffset(utc, tz); // second pass handles daylight-saving edges
  return new Date(utc);
}

export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function cleanSettings(v) {
  const s = { ...DEFAULT_BOOKING };
  s.enabled = v.enabled !== false;
  const tz = String(v.timezone || '').trim();
  if (!validTimezone(tz)) throw Object.assign(new Error('Enter a valid time zone, like Asia/Manila or America/New_York.'), { status: 400 });
  s.timezone = tz;
  s.days = [...new Set((Array.isArray(v.days) ? v.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if (!s.days.length) throw Object.assign(new Error('Choose at least one day you take calls.'), { status: 400 });
  s.slots = [...new Set((Array.isArray(v.slots) ? v.slots : []).map((t) => String(t).trim()).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
  if (!s.slots.length) throw Object.assign(new Error('Add at least one time slot, like 09:00.'), { status: 400 });
  s.duration = Math.min(240, Math.max(10, Number(v.duration) || 30));
  s.daysAhead = Math.min(120, Math.max(1, Number(v.daysAhead) || 30));
  s.minNoticeHours = Math.min(336, Math.max(0, Number(v.minNoticeHours) || 0));
  return s;
}
