import { NextRequest, NextResponse } from "next/server";
import {
  calculatePlatformFeeCents,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";
import {
  enrichListingsWithStripeState,
  getOrderBySessionId,
  recordCompletedOrder,
} from "@/lib/stripe-db";
import { isSupabaseConfigured, SAMPLE_LISTINGS } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { isValidUuid } from "@/lib/validation";

// GET /api/stripe/order-success?session_id=cs_test_...&listing_id=...&acct=acct_...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id")?.trim() || "";
    const rawListingId = searchParams.get("listing_id")?.trim() || "";
    const rawAcct = searchParams.get("acct")?.trim() || "";

    if (!sessionId || !sessionId.startsWith("cs_")) {
      return NextResponse.json(
        { error: "A valid Stripe Checkout session_id is required" },
        { status: 400 }
      );
    }

    let order = await getOrderBySessionId(sessionId);

    // Look up listing if listing_id is known
    const targetListingId = order?.listing_id || rawListingId;
    let rawListing = null;

    if (isValidUuid(targetListingId)) {
      if (isSupabaseConfigured()) {
        const db = getServerSupabaseClient();
        const { data } = await db
          .from("listings")
          .select("*")
          .eq("id", targetListingId)
          .single();
        rawListing =
          data ||
          SAMPLE_LISTINGS.find((item) => item.id === targetListingId) ||
          null;
      } else {
        rawListing = memoryStore.getListingById(targetListingId);
      }
    }

    let enrichedListing = null;
    if (rawListing) {
      const [enriched] = await enrichListingsWithStripeState([rawListing]);
      enrichedListing = enriched;
    }

    // Verify directly with Stripe on the connected account (or platform) and ensure Supabase order + Sold status are recorded
    if (isStripeConfigured()) {
      const stripe = getStripe();
      const stripeAccountId =
        rawAcct ||
        order?.seller_stripe_account_id ||
        enrichedListing?.seller_stripe_account_id ||
        "";

      try {
        const session = stripeAccountId
          ? await stripe.checkout.sessions.retrieve(
              sessionId,
              { expand: ["payment_intent"] },
              { stripeAccount: stripeAccountId }
            )
          : await stripe.checkout.sessions.retrieve(sessionId, {
              expand: ["payment_intent"],
            });

        const metaListingId =
          session.metadata?.listing_id?.trim() || targetListingId;

        if (!rawListing && isValidUuid(metaListingId)) {
          if (isSupabaseConfigured()) {
            const db = getServerSupabaseClient();
            const { data } = await db
              .from("listings")
              .select("*")
              .eq("id", metaListingId)
              .single();
            rawListing =
              data ||
              SAMPLE_LISTINGS.find((item) => item.id === metaListingId) ||
              null;
          } else {
            rawListing = memoryStore.getListingById(metaListingId);
          }
        }

        if (session.payment_status === "paid" && rawListing) {
          const totalCents =
            session.amount_total ??
            Math.round(Number(rawListing.price) * 100);
          const feeCents = session.metadata?.platform_fee_cents
            ? Number(session.metadata.platform_fee_cents)
            : calculatePlatformFeeCents(totalCents);

          const amountTotal = Math.round(totalCents) / 100;
          const platformFee = Math.round(feeCents) / 100;
          const sellerPayout =
            Math.round((amountTotal - platformFee) * 100) / 100;

          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id || null;

          order = await recordCompletedOrder({
            listing_id: rawListing.id,
            listing_title: rawListing.title,
            seller_email: rawListing.seller_email,
            seller_stripe_account_id:
              stripeAccountId ||
              session.metadata?.seller_stripe_account_id ||
              "",
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
        }
      } catch (err) {
        console.error("Stripe session verification error on success page:", err);
      }
    }

    if (rawListing) {
      const [refreshed] = await enrichListingsWithStripeState([rawListing]);
      enrichedListing = refreshed;
    }

    if (!order) {
      return NextResponse.json(
        { error: "Order details could not be verified yet." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      order,
      listing: enrichedListing,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/stripe/order-success:", err);
    return NextResponse.json(
      { error: "Failed to load order confirmation" },
      { status: 500 }
    );
  }
}
