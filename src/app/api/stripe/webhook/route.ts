import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  calculatePlatformFeeCents,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";
import {
  getSellerByEmail,
  getSellerByStripeAccountId,
  recordCompletedOrder,
  saveSellerAccount,
} from "@/lib/stripe-db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
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

      let listing = null;
      if (isSupabaseConfigured()) {
        const db = getServerSupabaseClient();
        const { data } = await db
          .from("listings")
          .select("*")
          .eq("id", listingId)
          .single();
        listing = data || null;
      } else {
        listing = memoryStore.getListingById(listingId);
      }

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

      const metaFeeCents = Number(session.metadata?.platform_fee_cents);
      const feeCents =
        Number.isFinite(metaFeeCents) && metaFeeCents >= 0
          ? metaFeeCents
          : calculatePlatformFeeCents(totalCents);

      const amountTotal = Math.round(totalCents) / 100;
      const platformFee = Math.round(feeCents) / 100;
      const sellerPayout = Math.round((amountTotal - platformFee) * 100) / 100;

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null;

      const order = await recordCompletedOrder({
        listing_id: listing.id,
        listing_title: listing.title,
        seller_email: listing.seller_email,
        seller_stripe_account_id: seller.stripe_account_id,
        buyer_email:
          session.customer_details?.email || session.customer_email || null,
        amount_total: amountTotal,
        platform_fee: platformFee,
        seller_payout: sellerPayout,
        currency: session.currency || "usd",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        status: "paid",
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

      const chargesEnabled = Boolean(account.charges_enabled);
      const payoutsEnabled = Boolean(account.payouts_enabled);
      const detailsSubmitted = Boolean(account.details_submitted);
      const onboardingComplete = Boolean(chargesEnabled && detailsSubmitted);

      await saveSellerAccount({
        email: existingSeller.email,
        stripe_account_id: accountId,
        onboarding_complete: onboardingComplete,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
      });

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
