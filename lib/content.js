// Field rules for each editable homepage section.
import { HttpError, str } from './http.js';

export const ICONS = ['layout', 'code', 'globe', 'cart', 'megaphone', 'search', 'pen', 'chart', 'phone', 'mail'];

function url(v, { relative = true } = {}) {
  const s = str(v, 1000);
  if (!s) return '';
  if (relative && s.startsWith('/') && !s.startsWith('//')) return s;
  try { const u = new URL(s); if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString(); } catch {}
  throw new HttpError(400, 'Links must start with https://');
}
const need = (v, msg) => { if (!v) throw new HttpError(400, msg); return v; };

export const TYPES = {
  project: (d) => ({
    title: need(str(d.title, 120), 'Enter a project title.'),
    tags: str(d.tags, 120), image: url(d.image), url: url(d.url)
  }),
  service: (d) => ({
    title: need(str(d.title, 80), 'Enter a service name.'),
    icon: ICONS.includes(d.icon) ? d.icon : 'layout',
    items: (Array.isArray(d.items) ? d.items : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 8),
    url: url(d.url)
  }),
  testimonial: (d) => ({
    quote: need(str(d.quote, 600), 'Enter the quote.'),
    name: need(str(d.name, 80), 'Enter the client name.'),
    role: str(d.role, 120), avatar: url(d.avatar)
  }),
  client: (d) => ({
    name: need(str(d.name, 80), 'Enter the client name.'),
    logo: url(d.logo), url: url(d.url)
  }),
  post: (d) => {
    const date = str(d.date, 10);
    return {
      title: need(str(d.title, 160), 'Enter a post title.'),
      summary: str(d.summary, 400), image: url(d.image), url: url(d.url),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
      body: str(d.body, 50000)
    };
  }
};

export const IMAGE_FIELDS = { project: ['image'], service: [], testimonial: ['avatar'], client: ['logo'], post: ['image'] };

export function validate(type, data) {
  if (!TYPES[type]) throw new HttpError(400, 'Unknown section.');
  return TYPES[type](data || {});
}
