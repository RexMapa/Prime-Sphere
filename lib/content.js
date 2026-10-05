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
    tags: str(d.tags, 120), image: url(d.image), image2: url(d.image2), image3: url(d.image3), url: url(d.url),
    featured: d.featured === true
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
  case: (d) => ({
    tag: str(d.tag, 40),
    name: need(str(d.name, 80), 'Enter the client or case study name.'),
    subtitle: str(d.subtitle, 120),
    big: need(str(d.big, 20), 'Enter the big number, like 10.9x.'),
    bigCaption: str(d.bigCaption, 140),
    barLeft: str(d.barLeft, 60), barRight: str(d.barRight, 60),
    barPercent: Math.min(100, Math.max(0, Math.round(Number(d.barPercent)) || 0)),
    stats: (Array.isArray(d.stats) ? d.stats : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 3)
  }),
  member: (d) => ({
    name: need(str(d.name, 80), 'Enter the team member\'s name.'),
    role: need(str(d.role, 80), 'Enter their role, like Shopify Developer.'),
    photo: url(d.photo), bio: str(d.bio, 280),
    linkedin: url(d.linkedin, { relative: false }), facebook: url(d.facebook, { relative: false }),
    instagram: url(d.instagram, { relative: false }), website: url(d.website, { relative: false }),
    featured: d.featured === true
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

export const IMAGE_FIELDS = { project: ['image', 'image2', 'image3'], service: [], testimonial: ['avatar'], client: ['logo'], case: [], post: ['image'], member: ['photo'] };

export function validate(type, data) {
  if (!TYPES[type]) throw new HttpError(400, 'Unknown section.');
  return TYPES[type](data || {});
}
