import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  enrichListingsWithStripeState,
  getAllSellersMap,
  getSellerByEmail,
  saveSellerAccount,
} from "@/lib/stripe-db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { isValidEmail } from "@/lib/validation";

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

// GET /api/stripe/connect - Get seller onboarding status (and sync with Stripe when returning from onboarding)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawEmail = searchParams.get("email")?.trim() || "";
    const rawAccountId = searchParams.get("account_id")?.trim() || "";

    if (rawEmail) {
      if (!isValidEmail(rawEmail)) {
        return NextResponse.json(
          { error: "Please provide a valid seller email address" },
          { status: 400 }
        );
      }

      const cleanEmail = rawEmail.toLowerCase();
      let seller = await getSellerByEmail(cleanEmail, {
        refreshFromStripe: true,
      });

      // If returning from Stripe with account_id and not yet synced, fetch directly from Stripe and save to Supabase
      if (
        rawAccountId &&
        rawAccountId.startsWith("acct_") &&
        isStripeConfigured() &&
        (!seller || seller.stripe_account_id === rawAccountId)
      ) {
        try {
          const stripe = getStripe();
          const account = await stripe.accounts.retrieve(rawAccountId);
          const chargesEnabled = Boolean(account.charges_enabled);
          const payoutsEnabled = Boolean(account.payouts_enabled);
          const detailsSubmitted = Boolean(account.details_submitted);
          const onboardingComplete = Boolean(
            chargesEnabled && detailsSubmitted
          );

          seller = await saveSellerAccount({
            email: cleanEmail,
            stripe_account_id: account.id,
            onboarding_complete: onboardingComplete,
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled,
            details_submitted: detailsSubmitted,
          });
        } catch (err) {
          console.error("Error retrieving Stripe account on return:", err);
        }
      }

      // Fetch listings belonging to this seller email
      let sellerListings = [];
      if (isSupabaseConfigured()) {
        const db = getServerSupabaseClient();
        const { data } = await db
          .from("listings")
          .select("*")
          .ilike("seller_email", cleanEmail)
          .order("created_at", { ascending: false });
        sellerListings = data || [];
      } else {
        sellerListings = memoryStore
          .getListings()
          .filter((l) => l.seller_email.toLowerCase() === cleanEmail);
      }

      const enrichedListings = await enrichListingsWithStripeState(
        sellerListings
      );

      return NextResponse.json({
        seller,
        listings: enrichedListings,
      });
    }

    // When no specific email is queried, return known sellers and distinct listing seller emails
    const sellersMap = await getAllSellersMap();
    const knownEmails = new Set<string>(sellersMap.keys());

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      const { data } = await db
        .from("listings")
        .select("seller_email")
        .order("created_at", { ascending: false })
        .limit(50);
      for (const row of data || []) {
        if (row.seller_email) {
          knownEmails.add(row.seller_email.trim().toLowerCase());
        }
      }
    } else {
      for (const item of memoryStore.getListings()) {
        knownEmails.add(item.seller_email.trim().toLowerCase());
      }
    }

    return NextResponse.json({
      sellers: Array.from(sellersMap.values()),
      suggestedEmails: Array.from(knownEmails),
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/stripe/connect:", err);
    return NextResponse.json(
      { error: "Failed to check seller Stripe status" },
      { status: 500 }
    );
  }
}

// POST /api/stripe/connect - Create/reuse a Stripe Connect account for the seller and return a hosted onboarding URL
export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe secret key is not configured on the server" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const rawEmail = body?.email;

    if (!isValidEmail(rawEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid seller email address" },
        { status: 400 }
      );
    }

    const cleanEmail = rawEmail.trim().toLowerCase();
    const stripe = getStripe();
    const origin = getOrigin(request);

    let existingSeller = await getSellerByEmail(cleanEmail);
    let stripeAccountId = existingSeller?.stripe_account_id || "";

    // Verify existing account still exists in Stripe sandbox
    if (stripeAccountId) {
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch {
        stripeAccountId = "";
      }
    }

    // Create a new Stripe Connect account if the seller doesn't have one yet
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        country: "US",
        email: cleanEmail,
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          stripe_dashboard: { type: "express" },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        business_profile: {
          url: "https://example.com",
          product_description: "Marketplace seller items",
        },
        metadata: {
          seller_email: cleanEmail,
          platform: "marketplace-stripe",
        },
      });

      stripeAccountId = account.id;

      existingSeller = await saveSellerAccount({
        email: cleanEmail,
        stripe_account_id: stripeAccountId,
        onboarding_complete: Boolean(
          account.charges_enabled && account.details_submitted
        ),
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
      });
    }

    // Create a hosted Stripe Account Onboarding link
    const returnUrl = `${origin}/connect?email=${encodeURIComponent(
      cleanEmail
    )}&account_id=${encodeURIComponent(stripeAccountId)}&onboarding=complete`;
    const refreshUrl = `${origin}/connect?email=${encodeURIComponent(
      cleanEmail
    )}&account_id=${encodeURIComponent(stripeAccountId)}&refresh=1`;

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({
      url: accountLink.url,
      stripe_account_id: stripeAccountId,
      seller: existingSeller,
    });
  } catch (err) {
    console.error("Stripe Connect onboarding error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to start Stripe Connect onboarding",
      },
      { status: 500 }
    );
  }
}
