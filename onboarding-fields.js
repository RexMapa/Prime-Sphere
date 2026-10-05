/* The client onboarding form, shared by the client area (/client) and the admin (/admin > Clients).
   Required keys must match REQUIRED_FIELDS in lib/clients.js. */
window.PS_ONBOARDING = [
  {
    id: 'you', title: 'About you', lead: 'Who we will be working with day to day.',
    fields: [
      { key: 'fullName', label: 'Full name', type: 'text', required: true, autocomplete: 'name' },
      { key: 'role', label: 'Your role', type: 'text', required: true, placeholder: 'e.g. Founder, Marketing manager' },
      { key: 'phone', label: 'Phone or WhatsApp', type: 'tel', required: true, autocomplete: 'tel', placeholder: 'Include your country code' },
      { key: 'contactMethod', label: 'Best way to reach you', type: 'choice', required: true, options: ['Email', 'WhatsApp', 'Viber', 'Phone call', 'Slack'] },
      { key: 'country', label: 'Country and time zone', type: 'text', required: true, placeholder: 'e.g. Australia, Sydney time' }
    ]
  },
  {
    id: 'business', title: 'Your business', lead: 'The basics of the brand we are growing.',
    fields: [
      { key: 'businessName', label: 'Business or brand name', type: 'text', required: true, autocomplete: 'organization' },
      { key: 'website', label: 'Website or store link', type: 'url', required: true, placeholder: 'https://' },
      { key: 'industry', label: 'Industry', type: 'select', required: true, options: ['Fashion and apparel', 'Beauty and skincare', 'Health and wellness', 'Home and living', 'Food and drink', 'Kids and family', 'Electronics and tech', 'Sports and outdoors', 'Pets', 'Jewellery and accessories', 'Services', 'Other'] },
      { key: 'businessType', label: 'What do you run today?', type: 'choice', required: true, options: ['Shopify store', 'Another e-commerce platform', 'Service business', 'Starting from scratch'] },
      { key: 'yearsInBusiness', label: 'Years in business', type: 'select', options: ['Not launched yet', 'Under 1 year', '1 to 3 years', '3 to 5 years', 'Over 5 years'] },
      { key: 'teamSize', label: 'Team size', type: 'select', options: ['Just me', '2 to 5', '6 to 20', '21 to 50', 'Over 50'] },
      { key: 'description', label: 'Describe your business in a few sentences', type: 'textarea', required: true, placeholder: 'What you sell, who buys it and what makes you different.' }
    ]
  },
  {
    id: 'goals', title: 'Services and goals', lead: 'What you want from working with us.',
    fields: [
      { key: 'services', label: 'Services you need', type: 'multi', required: true, options: ['Shopify development', 'Store management', 'Design and creative', 'Marketing and ads', 'Social media', 'SEO and content', 'Email marketing', 'Ongoing support'] },
      { key: 'primaryGoal', label: 'Main goal for the next 90 days', type: 'select', required: true, options: ['Launch a new store', 'Redesign or rebuild the store', 'Grow sales and revenue', 'Lower ad costs and improve ROAS', 'Grow email and SMS revenue', 'Build the brand and social following', 'Rank higher on Google', 'Hand off day-to-day store work'] },
      { key: 'goals', label: 'What does success look like?', type: 'textarea', required: true, placeholder: 'e.g. $50k a month in revenue by March, a 3x ROAS on Meta, a new site live before Black Friday.' },
      { key: 'kpis', label: 'Numbers you track today', type: 'textarea', placeholder: 'Monthly revenue, conversion rate, ROAS, email revenue share, anything you watch.' },
      { key: 'startDate', label: 'When would you like to start?', type: 'select', required: true, options: ['As soon as possible', 'Within 2 weeks', 'Within a month', 'In 1 to 3 months', 'Not sure yet'] },
      { key: 'budget', label: 'Monthly budget for our work', type: 'select', required: true, options: ['Under $1,000', '$1,000 to $2,500', '$2,500 to $5,000', '$5,000 to $10,000', 'Over $10,000', 'Project fee, not monthly'] }
    ]
  },
  {
    id: 'store', title: 'Store and marketing', lead: 'Where things stand today, so we can start from real numbers.',
    fields: [
      { key: 'shopifyPlan', label: 'Shopify plan', type: 'select', options: ['Not on Shopify', 'Basic', 'Shopify', 'Advanced', 'Plus', 'Not sure'] },
      { key: 'monthlyRevenue', label: 'Monthly online revenue', type: 'select', options: ['Not selling yet', 'Under $10k', '$10k to $50k', '$50k to $150k', '$150k to $500k', 'Over $500k'] },
      { key: 'adSpend', label: 'Monthly ad spend', type: 'select', options: ['None yet', 'Under $2k', '$2k to $10k', '$10k to $50k', 'Over $50k'] },
      { key: 'channels', label: 'Tools and channels you use', type: 'multi', options: ['Meta ads', 'Google ads', 'TikTok ads', 'Klaviyo', 'Mailchimp', 'Shopify Email', 'Google Analytics 4', 'Amazon', 'Marketplaces', 'Influencers'] },
      { key: 'audience', label: 'Who is your ideal customer?', type: 'textarea', required: true, placeholder: 'Age, location, what they care about, why they buy from you.' },
      { key: 'topProducts', label: 'Best sellers or hero products', type: 'textarea' },
      { key: 'competitors', label: 'Competitors or brands you admire', type: 'textarea', placeholder: 'Names or links, one per line.' }
    ]
  },
  {
    id: 'brand', title: 'Brand and access', lead: 'Assets and accounts we will need to get started.',
    fields: [
      { key: 'brandAssets', label: 'Brand guidelines, logos and photos', type: 'url', placeholder: 'A Google Drive, Dropbox or Canva link' },
      { key: 'brandVoice', label: 'How should your brand sound?', type: 'textarea', placeholder: 'e.g. warm and practical, never salesy. Words you love or avoid.' },
      { key: 'instagram', label: 'Instagram', type: 'text', placeholder: '@yourbrand' },
      { key: 'facebook', label: 'Facebook page', type: 'text', placeholder: 'Link or page name' },
      { key: 'tiktok', label: 'TikTok', type: 'text', placeholder: '@yourbrand' },
      { key: 'access', label: 'Access you can give us', type: 'multi', options: ['Shopify staff account', 'Meta Business Manager', 'Google Ads', 'Google Analytics 4', 'Klaviyo', 'Domain and DNS', 'Social media accounts'], help: 'We will send instructions for each after approval. Never share passwords here.' }
    ]
  },
  {
    id: 'billing', title: 'Billing', lead: 'Who we invoice. Payment details come after we approve your onboarding.',
    fields: [
      { key: 'billingName', label: 'Billing name or company', type: 'text', required: true },
      { key: 'billingEmail', label: 'Billing email', type: 'email', required: true, autocomplete: 'email' },
      { key: 'billingAddress', label: 'Billing address', type: 'textarea' },
      { key: 'taxId', label: 'Tax or business number', type: 'text', placeholder: 'ABN, TIN, VAT or similar (optional)' },
      { key: 'notes', label: 'Anything else we should know?', type: 'textarea' },
      { key: 'agree', label: 'I confirm these details are correct and agree to PrimeSphere contacting me about this project.', type: 'agree', required: true }
    ]
  }
];
