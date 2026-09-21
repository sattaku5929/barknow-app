import Stripe from "stripe";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let stripe: Stripe | null = null;

export function stripeClient() {
  if (!stripe) stripe = new Stripe(required("STRIPE_SECRET_KEY"), { maxNetworkRetries: 2 });
  return stripe;
}

export function coachingPriceId() {
  return required("STRIPE_COACHING_PRICE_ID");
}

export function stripeWebhookSecret() {
  return required("STRIPE_WEBHOOK_SECRET");
}
