// Validation and shaping for store records.
import { HttpError, str } from './http.js';

const MAX_PAGES = 12;

function cleanUrl(v, { allowRelative = false } = {}) {
  const s = str(v, 1000);
  if (!s) return '';
  if (allowRelative && s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {}
  return null;
}

export function validateStore(body) {
  const name = str(body.name, 120);
  if (!name) throw new HttpError(400, 'Enter a store name.');
  const category = str(body.category, 60);
  const url = cleanUrl(body.url);
  if (url === null) throw new HttpError(400, 'Store link must start with https://');
  const pagesIn = Array.isArray(body.pages) ? body.pages : [];
  if (pagesIn.length > MAX_PAGES) throw new HttpError(400, `A store can have up to ${MAX_PAGES} pages.`);
  const pages = [];
  for (const p of pagesIn) {
    const label = str(p && p.label, 40);
    const image = cleanUrl(p && p.image, { allowRelative: true });
    if (!label && !image) continue; // ignore empty rows
    if (!label) throw new HttpError(400, 'Every page needs a name, like Homepage or Product.');
    if (!image) throw new HttpError(400, `Add a screenshot for the "${label}" page.`);
    pages.push({ label, image });
  }
  const labels = pages.map((p) => p.label.toLowerCase());
  if (new Set(labels).size !== labels.length) throw new HttpError(400, 'Two pages have the same name. Give each page a different name.');
  return {
    name, category, url: url || '', pages,
    featured: !!body.featured,
    published: body.published !== false
  };
}

export function toPublic(row) {
  return { id: row.id, name: row.name, category: row.category, url: row.url, pages: row.pages || [] };
}
