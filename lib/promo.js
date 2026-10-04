// Countdown offer shown on the homepage. Stored in the settings table under key 'promo'.
import { HttpError, str } from './http.js';

export const DEFAULT_PROMO = {
  enabled: false,
  badge: 'Limited time offer',
  title: 'Up to 50% off',
  subtitle: 'Book any service before the timer runs out.',
  ctaText: 'Claim the offer',
  ctaUrl: '/contact',
  endsAt: ''
};

export async function getPromo(query) {
  const rows = await query(`SELECT value FROM settings WHERE key = 'promo'`);
  return { ...DEFAULT_PROMO, ...(rows[0] ? rows[0].value : {}) };
}

export function cleanPromo(v) {
  const s = { ...DEFAULT_PROMO };
  s.enabled = v.enabled === true;
  s.badge = str(v.badge, 40);
  s.title = str(v.title, 80) || DEFAULT_PROMO.title;
  s.subtitle = str(v.subtitle, 160);
  s.ctaText = str(v.ctaText, 30);
  const link = str(v.ctaUrl, 500);
  if (link && !/^(\/(?!\/)|https?:\/\/|#)/.test(link)) throw new HttpError(400, 'The button link must start with /, # or https://');
  s.ctaUrl = link;
  const t = Date.parse(v.endsAt);
  if (v.endsAt && Number.isNaN(t)) throw new HttpError(400, 'Choose a valid end date and time.');
  s.endsAt = v.endsAt ? new Date(t).toISOString() : '';
  if (s.enabled && !s.endsAt) throw new HttpError(400, 'Set when the offer ends before turning it on.');
  return s;
}
