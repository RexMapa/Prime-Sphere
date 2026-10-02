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
