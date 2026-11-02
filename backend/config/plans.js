// Limites calees sur ~600 tokens par reponse (mesure en production le
// 2026-11-02) : 480k = 800 reponses, 1,8M = 3 000, 6M = 10 000 par mois.
const PLANS = [
  {
    key: 'base',
    name: 'Base',
    priceCents: 999,
    monthlyTokenLimit: 480000,
    allowCustomBranding: false,
    stripePriceEnv: 'STRIPE_PRICE_BASE',
  },
  {
    key: 'base_plus',
    name: 'Base+',
    priceCents: 1299,
    monthlyTokenLimit: 480000,
    allowCustomBranding: true,
    stripePriceEnv: 'STRIPE_PRICE_BASE_PLUS',
  },
  {
    key: 'pro',
    name: 'Pro',
    priceCents: 2999,
    monthlyTokenLimit: 1800000,
    allowCustomBranding: true,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
  },
  {
    key: 'enterprise',
    name: 'Entreprise',
    priceCents: 4999,
    monthlyTokenLimit: 6000000,
    allowCustomBranding: true,
    stripePriceEnv: 'STRIPE_PRICE_ENTERPRISE',
  },
];

const TOKEN_PACKS = [
  {
    key: 'small',
    name: 'Petit pack',
    priceCents: 299,
    tokenAmount: 60000,
    stripePriceEnv: 'STRIPE_PRICE_PACK_SMALL',
  },
  {
    key: 'medium',
    name: 'Moyen pack',
    priceCents: 599,
    tokenAmount: 150000,
    stripePriceEnv: 'STRIPE_PRICE_PACK_MEDIUM',
  },
  {
    key: 'large',
    name: 'Grand pack',
    priceCents: 1099,
    tokenAmount: 360000,
    stripePriceEnv: 'STRIPE_PRICE_PACK_LARGE',
  },
];

const DEMO_PLAN = {
  key: 'demo',
  name: 'Demo (interne)',
  priceCents: 0,
  // Pratiquement illimite, mais garde un plafond pour qu'un abus du widget de
  // demo ne fasse pas exploser la facture OpenAI. La base de connaissances du
  // capybara demo (~2 000 tokens) est relue a chaque reponse : ~2 500 tokens
  // par reponse, soit environ 4 000 reponses / mois.
  monthlyTokenLimit: 10000000,
  allowCustomBranding: true,
  stripePriceEnv: null,
};

module.exports = { PLANS, TOKEN_PACKS, DEMO_PLAN };
