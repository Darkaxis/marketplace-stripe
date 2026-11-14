import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  getListingById,
  getSellerByEmail,
  getSellerByStripeAccountId,
  recordOrderFromCheckoutSession,
  saveSellerAccount,
  sellerInputFromStripeAccount,
} from "@/lib/stripe-db";
import { isValidUuid } from "@/lib/validation";

export const runtime = "nodejs";

// GET /api/stripe/webhook - Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/stripe/webhook",
    connect: true,
    webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  });
}

// POST /api/stripe/webhook - Stripe Connect Webhook Handler
export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500 }
      );
    }

    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

    if (!signature || !webhookSecret) {
      return NextResponse.json(
        { error: "Missing stripe-signature header or STRIPE_WEBHOOK_SECRET" },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      return NextResponse.json(
        {
          error: `Webhook signature verification failed: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        },
        { status: 400 }
      );
    }

    // 1. Handle checkout.session.completed / async_payment_succeeded
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only finalize when payment has actually settled
      if (session.payment_status !== "paid") {
        return NextResponse.json(
          { received: true, ignored: true, reason: "payment_not_paid" },
          { status: 200 }
        );
      }

      const listingId = session.metadata?.listing_id?.trim() || "";

      // Shared sandbox safety: ignore events without a valid listing_id in our database
      if (!isValidUuid(listingId)) {
        return NextResponse.json(
          { received: true, ignored: true, reason: "unrecognized_listing_id" },
          { status: 200 }
        );
      }

      const listing = await getListingById(listingId);

      // If this listing does not exist in our Supabase database, it belongs to another candidate in the shared sandbox
      if (!listing) {
        return NextResponse.json(
          { received: true, ignored: true, reason: "external_listing" },
          { status: 200 }
        );
      }

      // Verify the connected account matches the listing's onboarded seller in our DB
      const seller = await getSellerByEmail(listing.seller_email);
      const eventAccountId =
        event.account ||
        session.metadata?.seller_stripe_account_id?.trim() ||
        "";

      if (
        !seller ||
        !seller.stripe_account_id ||
        (eventAccountId && eventAccountId !== seller.stripe_account_id)
      ) {
        return NextResponse.json(
          { received: true, ignored: true, reason: "seller_account_mismatch" },
          { status: 200 }
        );
      }

      const expectedMinCents = Math.round(Number(listing.price) * 100);
      const metaAmountCents = Number(session.metadata?.amount_total_cents);
      const totalCents =
        session.amount_total ??
        (Number.isFinite(metaAmountCents) && metaAmountCents > 0
          ? metaAmountCents
          : expectedMinCents);

      if (totalCents < expectedMinCents) {
        return NextResponse.json(
          { received: true, ignored: true, reason: "amount_mismatch" },
          { status: 200 }
        );
      }

      const order = await recordOrderFromCheckoutSession({
        listing,
        session,
        sellerStripeAccountId: seller.stripe_account_id,
        totalCents,
      });

      return NextResponse.json(
        { received: true, order_id: order.id, listing_id: listing.id },
        { status: 200 }
      );
    }

    // 2. Handle account.updated (Update already-tracked seller's Stripe Connect onboarding status in Supabase)
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const accountId = account.id;

      // Only update accounts already created & tracked in our Supabase database
      // (prevents shared-sandbox spoofing via crafted metadata)
      const existingSeller = await getSellerByStripeAccountId(accountId);
      if (!existingSeller) {
        return NextResponse.json(
          { received: true, ignored: true, reason: "external_account" },
          { status: 200 }
        );
      }

      await saveSellerAccount(
        sellerInputFromStripeAccount(existingSeller.email, account)
      );

      return NextResponse.json(
        { received: true, account_id: accountId },
        { status: 200 }
      );
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error in Stripe webhook handler:", err);
    return NextResponse.json(
      { error: "Webhook handler error" },
      { status: 500 }
    );
  }
}
