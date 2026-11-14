import Stripe from "stripe";

export const PLATFORM_FEE_PERCENT = 0.1; // 10% marketplace platform fee

let cachedStripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_SECRET_KEY.startsWith("sk_")
  );
}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured in environment variables."
    );
  }

  if (!cachedStripe) {
    cachedStripe = new Stripe(secretKey);
  }

  return cachedStripe;
}

/**
 * Calculates the 10% marketplace application fee in cents for a given price in cents.
 */
export function calculatePlatformFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * PLATFORM_FEE_PERCENT);
}
