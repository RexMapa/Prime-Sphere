// Placeholder stores added the first time the database is set up.
// Delete or edit them from /admin once your real stores are in.
const cats = ['Fashion', 'Beauty', 'Home and Living', 'Food and Beverage', 'Health and Wellness', 'Fashion', 'Home and Living', 'Beauty', 'Food and Beverage'];
const imgs = [1, 2, 3, 4, 5, 2, 4, 1, 5];

export const SEED_STORES = cats.map((category, i) => {
  const n = imgs[i];
  return {
    name: `Store Name ${i + 1}`,
    category,
    url: 'https://example.com',
    featured: i < 5,
    pages: [
      { label: 'Homepage', image: `/assets/stores/store-${n}.svg` },
      { label: 'Collection', image: `/assets/stores/store-${n}-collection.svg` },
      { label: 'Product', image: `/assets/stores/store-${n}-product.svg` },
      { label: 'Cart', image: `/assets/stores/store-${n}-cart.svg` },
      { label: 'About', image: `/assets/stores/store-${n}-about.svg` }
    ]
  };
});

// Homepage sections, added once the first time the database is set up. Edit them in /admin > Content.
export const SEED_CONTENT = {
  project: [
    { title: 'Creative Logo Design', tags: 'Branding, Identity', image: '', url: '' },
    { title: 'Business Website Design', tags: 'Web, Development', image: '', url: '' },
    { title: '3D Illustration Making', tags: 'Illustration, Motion', image: '', url: '' }
  ],
  service: [
    { title: 'UI/UX Design', icon: 'layout', items: ['Mobile Applications', 'Web Applications', 'Websites and Landing Pages', 'Branding Design'], url: '' },
    { title: 'Front-End Development', icon: 'code', items: ['Mobile Applications', 'Web Applications', 'Websites and Landing Pages', 'Design Systems'], url: '' },
    { title: 'Web Development', icon: 'globe', items: ['E-commerce Stores', 'Web Applications', 'Websites and Landing Pages', 'SEO and Performance'], url: '' }
  ],
  testimonial: [
    { quote: 'Client quote goes here: a sentence or two about the results PrimeSphere delivered for their business.', name: 'Client Name', role: 'Role, Company', avatar: '' },
    { quote: 'Second client quote: what it was like working with the team and what changed after launch.', name: 'Client Name', role: 'Role, Company', avatar: '' },
    { quote: 'Third client quote: a specific outcome, like more leads, faster pages or a stronger brand.', name: 'Client Name', role: 'Role, Company', avatar: '' }
  ],
  client: [1, 2, 3, 4, 5, 6].map((n) => ({ name: 'Client logo', logo: '', url: '' })),
  post: [
    {
      title: 'How Behavioral Data Can Be Used to Grow Your Business',
      summary: "What your visitors' clicks, scrolls and drop-offs reveal, and how to turn those signals into better pages.",
      image: '', url: '', date: '2026-09-15',
      body: 'Replace this with your article.\n\nSeparate paragraphs with a blank line.'
    },
    {
      title: 'Going Global: Building a Website for International Customers',
      summary: 'Language, currency, speed and trust signals: the essentials for selling beyond your home market.',
      image: '', url: '', date: '2026-09-01',
      body: 'Replace this with your article.\n\nSeparate paragraphs with a blank line.'
    }
  ]
};

// Case studies for the Work page, added once (also on databases that already exist).
export const SEED_CASES = [
  { tag: 'Revenue-first', name: 'Lumière IV', subtitle: 'Scaling beyond the dashboard', big: '10.9x', bigCaption: 'ROAS. 8.2x true marketing ROI after management fees.', barLeft: 'A$1,820 ad spend', barRight: 'A$19,991 revenue', barPercent: 100, stats: ['56 | New paying clients', 'A$18,171 | Gross marketing profit', '4.5 mo | Campaign length'] },
  { tag: 'Intent-first', name: 'Aglow Aesthetics', subtitle: 'Engineering intent in Perth, no backend tracking', big: '7.69%', bigCaption: 'Search CTR on a lean A$20 per day budget.', barLeft: '7.69% CTR', barRight: 'Strong intent match', barPercent: 77, stats: ['1,389 | Qualified clicks', 'A$1.19 | Avg. CPC', 'A$20 | Daily budget'] }
];
