window.PS_ACCESS_REQUESTS = [
  {
    "id": "shopify",
    "title": "Shopify Store Access",
    "lead": "Connect your Shopify store using collaborator access.",
    "work": [
      "Review your store and prepare website improvements.",
      "Review products, navigation, apps and subscriptions."
    ],
    "guide": "Find the collaborator request code in your Shopify store settings. Your account manager will coordinate the collaborator request.",
    "fields": [
      {
        "key": "store",
        "label": "Your website or store name",
        "type": "text",
        "required": true
      },
      {
        "key": "code",
        "label": "Collaborator request code",
        "type": "text",
        "required": true
      }
    ]
  },
  {
    "id": "domain",
    "title": "Domain, DNS, and Business Email",
    "lead": "Tell us where your domain and email are managed so we can coordinate setup.",
    "work": [
      "Review domain configuration and tracking.",
      "Review DNS records for business email deliverability."
    ],
    "guide": "Check your domain purchase email for the registrar. If you are unsure, choose Unsure and ask your account manager.",
    "fields": [
      {
        "key": "domain",
        "label": "Primary domain (your website URL)",
        "type": "text",
        "required": true
      },
      {
        "key": "registrar",
        "label": "Where the domain was purchased",
        "type": "select",
        "required": true,
        "options": [
          "Cloudflare",
          "GoDaddy",
          "Namecheap",
          "Google / Squarespace",
          "Shopify",
          "Other",
          "Unsure"
        ]
      },
      {
        "key": "manager",
        "label": "Who manages DNS right now",
        "type": "select",
        "required": true,
        "options": [
          "Me",
          "My team",
          "Developer / agency",
          "Other",
          "Unsure"
        ]
      },
      {
        "key": "email",
        "label": "Business email provider",
        "type": "select",
        "required": true,
        "options": [
          "Google Workspace",
          "Microsoft 365",
          "Zoho Mail",
          "Other",
          "None",
          "Unsure"
        ]
      }
    ]
  },
  {
    "id": "googleAds",
    "title": "Google Ads Access",
    "lead": "Share your customer ID so we can coordinate a manager account link request.",
    "work": [
      "Audit campaigns, targeting and conversion tracking.",
      "Review campaign structure and budget allocation."
    ],
    "guide": "Find the ten-digit customer ID in your Google Ads account. Your account manager will send the link request and help you accept it.",
    "fields": [
      {
        "key": "account",
        "label": "Google Ads account ID",
        "type": "text",
        "required": true
      },
      {
        "key": "confirmed",
        "label": "Confirm you have provided your Google Ads account ID",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      }
    ]
  },
  {
    "id": "merchant",
    "title": "Google Merchant Center Access",
    "lead": "Connect product listings and feeds for Google Shopping.",
    "work": [
      "Review and connect your product feed.",
      "Improve product listing quality and visibility."
    ],
    "guide": "Your account manager will share the team email addresses and required access role. Invite those addresses in your account access settings.",
    "fields": [
      {
        "key": "account",
        "label": "Google Merchant Center account ID",
        "type": "text",
        "required": true
      },
      {
        "key": "invited",
        "label": "Confirm you have invited our team with Admin access",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      }
    ]
  },
  {
    "id": "searchConsole",
    "title": "Google Search Console Access",
    "lead": "Connect your property to review organic search performance.",
    "work": [
      "Monitor search performance.",
      "Identify keyword and content opportunities."
    ],
    "guide": "Your account manager will share the team email addresses. Add them to the relevant Search Console property with Full access.",
    "fields": [
      {
        "key": "property",
        "label": "Google Search Console property URL",
        "type": "text",
        "required": true
      },
      {
        "key": "invited",
        "label": "Confirm you have invited our team with Full access",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      }
    ]
  },
  {
    "id": "meta",
    "title": "Meta Business Suite Access",
    "lead": "Coordinate access to your Facebook Page, Instagram, ad account and pixel.",
    "work": [
      "Review campaigns and tracking.",
      "Prepare targeting and creative improvements."
    ],
    "guide": "Your account manager will share the team details and requested permissions. Use your business settings to grant the agreed assets and access.",
    "fields": [
      {
        "key": "business",
        "label": "Meta Business Manager ID (if known)",
        "type": "text",
        "required": false
      },
      {
        "key": "facebook",
        "label": "Facebook Page URL",
        "type": "text",
        "required": false
      },
      {
        "key": "instagram",
        "label": "Instagram handle",
        "type": "text",
        "required": false
      },
      {
        "key": "adAccount",
        "label": "Meta Ad Account ID (if known)",
        "type": "text",
        "required": false
      },
      {
        "key": "pixel",
        "label": "Meta Pixel ID (if known)",
        "type": "text",
        "required": false
      },
      {
        "key": "invited",
        "label": "Confirm you have added our team with the agreed access",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      }
    ]
  },
  {
    "id": "klaviyo",
    "title": "Klaviyo Access",
    "lead": "Coordinate email marketing access for automation and campaigns.",
    "work": [
      "Review welcome, abandoned cart and post-purchase flows.",
      "Review signup forms and audience segments."
    ],
    "guide": "Your account manager will share the team email addresses and access role. If you do not have an account, choose No.",
    "fields": [
      {
        "key": "exists",
        "label": "Do you already have a Klaviyo account?",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      },
      {
        "key": "invited",
        "label": "Confirm you have invited our team as Admin",
        "type": "select",
        "required": false,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      }
    ]
  },
  {
    "id": "tracking",
    "title": "Microsoft Clarity and Tracking",
    "lead": "Tell us which analytics tools are currently installed.",
    "work": [
      "Review visitor behaviour and conversion blockers.",
      "Check analytics and tag configuration."
    ],
    "guide": "If you do not know, choose Unsure. We can review the current setup once store access is available.",
    "fields": [
      {
        "key": "clarity",
        "label": "Is Microsoft Clarity currently installed?",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      },
      {
        "key": "analytics",
        "label": "Is Google Analytics (GA4) installed?",
        "type": "select",
        "required": true,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      },
      {
        "key": "measurement",
        "label": "GA4 measurement ID (if known)",
        "type": "text",
        "required": false
      },
      {
        "key": "container",
        "label": "Google Tag Manager container ID (if known)",
        "type": "text",
        "required": false
      }
    ]
  },
  {
    "id": "reviews",
    "title": "Reviews and Trust System",
    "lead": "Share your existing reviews and supporting brand evidence.",
    "work": [
      "Review your product review collection system.",
      "Identify suitable social proof and trust signals."
    ],
    "guide": "Share supporting documentation through the portal. Your account manager can help review claims and permissions for customer content.",
    "fields": [
      {
        "key": "app",
        "label": "Reviews app currently installed in Shopify",
        "type": "text",
        "required": false
      },
      {
        "key": "location",
        "label": "Where your best reviews currently live",
        "type": "text",
        "required": false
      },
      {
        "key": "photos",
        "label": "Do you have before and after photos or results you are comfortable sharing?",
        "type": "select",
        "required": false,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      },
      {
        "key": "claims",
        "label": "Claims to avoid unless you can provide proof",
        "type": "textarea",
        "required": false
      }
    ]
  },
  {
    "id": "sms",
    "title": "SMS Marketing",
    "lead": "Tell us about your current SMS platform and access.",
    "work": [
      "Review the current SMS setup.",
      "Evaluate SMS campaigns and recovery flows."
    ],
    "guide": "If you are unsure which platform you use, ask your account manager in the portal.",
    "fields": [
      {
        "key": "provider",
        "label": "Current SMS provider",
        "type": "select",
        "required": true,
        "options": [
          "None",
          "Klaviyo",
          "Attentive",
          "Postscript",
          "SMSBump / Yotpo",
          "Other",
          "Unsure"
        ]
      },
      {
        "key": "granted",
        "label": "Access to SMS platform granted",
        "type": "select",
        "required": false,
        "options": [
          "Yes",
          "No",
          "Unsure"
        ]
      }
    ]
  }
];
