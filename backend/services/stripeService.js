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

// Change le forfait d'un abonnement existant au lieu d'en creer un second :
// Stripe ajuste la difference au prorata sur la prochaine facture.
async function changeSubscriptionPrice(stripeSubscriptionId, priceId) {
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  return stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: subscription.items.data[0].id, price: priceId }],
    proration_behavior: 'create_prorations',
  });
}

async function cancelSubscription(stripeSubscriptionId) {
  try {
    return await stripe.subscriptions.cancel(stripeSubscriptionId);
  } catch (err) {
    // Deja annule ou inexistant chez Stripe : rien a facturer, on continue.
    if (err.code === 'resource_missing') return null;
    throw err;
  }
}

module.exports = {
  stripe,
  getOrCreateCustomer,
  createSubscriptionCheckout,
  createTokenPackCheckout,
  setAutopay,
  changeSubscriptionPrice,
  cancelSubscription,
};
