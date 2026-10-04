// Text and numbers for the Work page. Stored in the settings table under key 'work'.
import { HttpError, str } from './http.js';

export const DEFAULT_WORK = {
  heroLine1: 'Work that moves', heroLine2: 'the needle.',
  heroText: 'A look at the campaigns, stores and brands we have helped launch and grow, with the real numbers behind them.',
  stats: [
    { value: 'A$19,991', label: 'Revenue tracked from ads' },
    { value: '10.9x', label: 'Best return on ad spend' },
    { value: '1,389', label: 'Qualified clicks driven' },
    { value: '7.69%', label: 'Search click-through rate' }
  ],
  casesEyebrow: 'Case studies', casesTitle: 'Real results for aesthetic clinics',
  casesText: 'Two Google Ads campaigns, two different challenges, both built around what matters: profit and intent.',
  casesNote: 'Lumière IV figures exclude mobile travel fees and repeat-client lifetime value.',
  projectsEyebrow: 'Projects', projectsTitle: 'Brands, stores and campaigns',
  projectsText: 'Click any project to see it up close.',
  ctaTitle: "Let's build your next success story", ctaText: 'Tell us about your goals and we will show you what is possible.',
  ctaButton: 'Start a project', ctaLink: '/contact'
};

export async function getWork(query) {
  const rows = await query(`SELECT value FROM settings WHERE key = 'work'`);
  return { ...DEFAULT_WORK, ...(rows[0] ? rows[0].value : {}) };
}

export function cleanWork(v) {
  const s = { ...DEFAULT_WORK };
  const t = (k, max) => { s[k] = str(v[k], max); };
  t('heroLine1', 60); t('heroLine2', 60); t('heroText', 300);
  t('casesEyebrow', 40); t('casesTitle', 100); t('casesText', 240); t('casesNote', 240);
  t('projectsEyebrow', 40); t('projectsTitle', 100); t('projectsText', 240);
  t('ctaTitle', 100); t('ctaText', 240); t('ctaButton', 30);
  const link = str(v.ctaLink, 500);
  if (link && !/^(\/(?!\/)|https?:\/\/|#)/.test(link)) throw new HttpError(400, 'The button link must start with /, # or https://');
  s.ctaLink = link;
  s.stats = (Array.isArray(v.stats) ? v.stats : []).slice(0, 4)
    .map((x) => ({ value: str(x && x.value, 20), label: str(x && x.label, 60) })).filter((x) => x.value);
  return s;
}
