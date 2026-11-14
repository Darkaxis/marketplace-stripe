import { NextRequest, NextResponse } from "next/server";
import {
  calculatePlatformFeeCents,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";
import {
  enrichListingsWithStripeState,
  recordPendingCheckoutSession,
} from "@/lib/stripe-db";
import { isSupabaseConfigured, SAMPLE_LISTINGS } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { isValidEmail, isValidUuid } from "@/lib/validation";

function getOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const origin = request.nextUrl.origin;
  if (origin && origin !== "null") {
    return origin.replace(/\/+$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

// POST /api/stripe/checkout - Create a Stripe Checkout session (Direct Charge on Seller's Connected Account with 10% Platform Fee)
export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured on the server" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { listing_id, buyer_email } = body ?? {};

    if (!isValidUuid(listing_id)) {
      return NextResponse.json(
        { error: "A valid listing ID is required" },
        { status: 400 }
      );
    }

    const cleanId = listing_id.trim();
    let rawListing = null;

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      const { data } = await db
        .from("listings")
        .select("*")
        .eq("id", cleanId)
        .single();
      rawListing =
        data || SAMPLE_LISTINGS.find((item) => item.id === cleanId) || null;
    } else {
      rawListing = memoryStore.getListingById(cleanId);
    }

    if (!rawListing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    const [listing] = await enrichListingsWithStripeState([rawListing], {
      syncUnfinishedSellersWithStripe: true,
    });

    if (listing.sold || listing.status === "sold") {
      return NextResponse.json(
        { error: "This item has already been sold." },
        { status: 409 }
      );
    }

    if (!listing.seller_onboarded || !listing.seller_stripe_account_id) {
      return NextResponse.json(
        {
          error:
            "This seller has not completed Stripe Connect onboarding yet. Only listings from onboarded sellers can be purchased.",
        },
        { status: 403 }
      );
    }

    const unitAmount = Math.round(Number(listing.price) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount < 50) {
      return NextResponse.json(
        { error: "Listing price must be at least $0.50 for Stripe Checkout." },
        { status: 400 }
      );
    }

    const applicationFeeAmount = calculatePlatformFeeCents(unitAmount);
    const sellerAccountId = listing.seller_stripe_account_id;
    const stripe = getStripe();
    const origin = getOrigin(request);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        ...(buyer_email && isValidEmail(buyer_email)
          ? { customer_email: buyer_email.trim() }
          : {}),
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: listing.title,
                description: listing.description
                  ? listing.description.slice(0, 300)
                  : `Marketplace item sold by ${listing.seller_email}`,
                ...(listing.image_url &&
                listing.image_url.startsWith("https://")
                  ? { images: [listing.image_url] }
                  : {}),
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount,
          metadata: {
            listing_id: listing.id,
            listing_title: listing.title.slice(0, 200),
            seller_email: listing.seller_email,
            seller_stripe_account_id: sellerAccountId,
            amount_total_cents: String(unitAmount),
            platform_fee_cents: String(applicationFeeAmount),
          },
        },
        metadata: {
          listing_id: listing.id,
          listing_title: listing.title.slice(0, 200),
          seller_email: listing.seller_email,
          seller_stripe_account_id: sellerAccountId,
          amount_total_cents: String(unitAmount),
          platform_fee_cents: String(applicationFeeAmount),
        },
        success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&listing_id=${encodeURIComponent(
          listing.id
        )}&acct=${encodeURIComponent(sellerAccountId)}`,
        cancel_url: `${origin}/item/${encodeURIComponent(
          listing.id
        )}?checkout=cancelled`,
      },
      {
        stripeAccount: sellerAccountId,
      }
    );

    await recordPendingCheckoutSession({
      listing_id: listing.id,
      session_id: session.id,
      seller_stripe_account_id: sellerAccountId,
    });

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
    });
  } catch (err) {
    console.error("Stripe Checkout session creation error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create Stripe Checkout session",
      },
      { status: 500 }
    );
  }
}
