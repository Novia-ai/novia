const PLANS = [
  {
    key: 'base',
    name: 'Base',
    priceCents: 999,
    monthlyTokenLimit: 50000,
    allowCustomBranding: false,
    stripePriceEnv: 'STRIPE_PRICE_BASE',
  },
  {
    key: 'base_plus',
    name: 'Base+',
    priceCents: 1299,
    monthlyTokenLimit: 50000,
    allowCustomBranding: true,
    stripePriceEnv: 'STRIPE_PRICE_BASE_PLUS',
  },
  {
    key: 'pro',
    name: 'Pro',
    priceCents: 2999,
    monthlyTokenLimit: 200000,
    allowCustomBranding: true,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
  },
  {
    key: 'enterprise',
    name: 'Entreprise',
    priceCents: 4999,
    monthlyTokenLimit: 750000,
    allowCustomBranding: true,
    stripePriceEnv: 'STRIPE_PRICE_ENTERPRISE',
  },
];

const TOKEN_PACKS = [
  {
    key: 'small',
    name: 'Petit pack',
    priceCents: 299,
    tokenAmount: 10000,
    stripePriceEnv: 'STRIPE_PRICE_PACK_SMALL',
  },
  {
    key: 'medium',
    name: 'Moyen pack',
    priceCents: 599,
    tokenAmount: 25000,
    stripePriceEnv: 'STRIPE_PRICE_PACK_MEDIUM',
  },
  {
    key: 'large',
    name: 'Grand pack',
    priceCents: 1099,
    tokenAmount: 60000,
    stripePriceEnv: 'STRIPE_PRICE_PACK_LARGE',
  },
];

module.exports = { PLANS, TOKEN_PACKS };
