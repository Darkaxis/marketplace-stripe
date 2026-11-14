import { NextRequest, NextResponse } from "next/server";
import {
  calculatePlatformFeeCents,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";
import {
  enrichListingsWithStripeState,
  getOrderBySessionId,
  getSellerByEmail,
  recordCompletedOrder,
} from "@/lib/stripe-db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import {
  isValidStripeAccountId,
  isValidStripeSessionId,
  isValidUuid,
  maskEmail,
} from "@/lib/validation";

// GET /api/stripe/order-success?session_id=cs_test_...&listing_id=...&acct=acct_...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id")?.trim() || "";
    const rawListingId = searchParams.get("listing_id")?.trim() || "";
    const rawAcct = searchParams.get("acct")?.trim() || "";

    if (!isValidStripeSessionId(sessionId)) {
      return NextResponse.json(
        { error: "A valid Stripe Checkout session_id is required" },
        { status: 400 }
      );
    }

    let order = await getOrderBySessionId(sessionId);

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
        rawListing = data || null;
      } else {
        rawListing = memoryStore.getListingById(targetListingId);
      }
    }

    let enrichedListing = null;
    if (rawListing) {
      const [enriched] = await enrichListingsWithStripeState([rawListing]);
      enrichedListing = enriched;
    }

    // If webhook hasn't recorded the order yet, verify directly with Stripe using the seller's verified connected account
    if (!order && isStripeConfigured()) {
      const stripe = getStripe();
      const dbSeller = rawListing
        ? await getSellerByEmail(rawListing.seller_email)
        : null;

      // Always prefer the DB-verified connected account for this listing/order
      const stripeAccountId =
        dbSeller?.stripe_account_id ||
        enrichedListing?.seller_stripe_account_id ||
        (isValidStripeAccountId(rawAcct) ? rawAcct : "");

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

        const metaListingId = session.metadata?.listing_id?.trim() || "";

        if (!rawListing && isValidUuid(metaListingId)) {
          if (isSupabaseConfigured()) {
            const db = getServerSupabaseClient();
            const { data } = await db
              .from("listings")
              .select("*")
              .eq("id", metaListingId)
              .single();
            rawListing = data || null;
          } else {
            rawListing = memoryStore.getListingById(metaListingId);
          }
        }

        if (rawListing) {
          const listingSeller =
            dbSeller || (await getSellerByEmail(rawListing.seller_email));
          const expectedSellerAcct = listingSeller?.stripe_account_id || "";
          const expectedMinCents = Math.round(Number(rawListing.price) * 100);

          const listingMatches =
            metaListingId === rawListing.id &&
            (!expectedSellerAcct || stripeAccountId === expectedSellerAcct) &&
            (!session.metadata?.seller_stripe_account_id ||
              session.metadata.seller_stripe_account_id === stripeAccountId);

          if (
            session.payment_status === "paid" &&
            listingMatches &&
            (session.amount_total ?? 0) >= expectedMinCents
          ) {
            const totalCents = session.amount_total ?? expectedMinCents;
            const metaFeeCents = Number(session.metadata?.platform_fee_cents);
            const feeCents =
              Number.isFinite(metaFeeCents) && metaFeeCents >= 0
                ? metaFeeCents
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
                expectedSellerAcct ||
                stripeAccountId ||
                session.metadata?.seller_stripe_account_id ||
                "",
              buyer_email:
                session.customer_details?.email ||
                session.customer_email ||
                null,
              amount_total: amountTotal,
              platform_fee: platformFee,
              seller_payout: sellerPayout,
              currency: session.currency || "usd",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: paymentIntentId,
              status: "paid",
            });
          }
        }
      } catch (err) {
        console.error("Stripe session verification error on success page:", err);
      }
    }

    if (rawListing) {
      const [refreshed] = await enrichListingsWithStripeState([rawListing]);
      const { seller_stripe_account_id: _omit, ...publicListing } = refreshed;
      enrichedListing = publicListing;
    }

    if (!order) {
      return NextResponse.json(
        { error: "Order details could not be verified yet." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      order: {
        ...order,
        buyer_email: order.buyer_email ? maskEmail(order.buyer_email) : null,
      },
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
