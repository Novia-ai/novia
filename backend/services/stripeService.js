const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getOrCreateCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripe.customers.create({ email: user.email });
  return customer.id;
}

async function createSubscriptionCheckout({ customerId, priceId, successUrl, cancelUrl, metadata }) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: { metadata },
  });
}

async function createTokenPackCheckout({ customerId, priceId, successUrl, cancelUrl, metadata }) {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

async function setAutopay(stripeSubscriptionId, autopay) {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: !autopay,
  });
}

module.exports = {
  stripe,
  getOrCreateCustomer,
  createSubscriptionCheckout,
  createTokenPackCheckout,
  setAutopay,
};
