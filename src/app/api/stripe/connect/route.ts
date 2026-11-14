import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  enrichListingsWithStripeState,
  getSellerByEmail,
  saveSellerAccount,
} from "@/lib/stripe-db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getSafeSiteOrigin,
  isValidEmail,
  isValidStripeAccountId,
} from "@/lib/validation";

// GET /api/stripe/connect?email=... - Check a seller's Stripe Connect onboarding status & their listings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawEmail = searchParams.get("email")?.trim() || "";
    const rawAccountId = searchParams.get("account_id")?.trim() || "";

    if (!rawEmail) {
      return NextResponse.json({
        configured: isStripeConfigured(),
      });
    }

    if (!isValidEmail(rawEmail)) {
      return NextResponse.json(
        { error: "Please provide a valid seller email address" },
        { status: 400 }
      );
    }

    const cleanEmail = rawEmail.toLowerCase();

    // Only look up / refresh the account already bound to this email in Supabase.
    // Never accept an arbitrary `account_id` from query params when no seller exists in DB.
    let seller = await getSellerByEmail(cleanEmail, {
      refreshFromStripe: true,
    });

    if (
      seller &&
      rawAccountId &&
      isValidStripeAccountId(rawAccountId) &&
      seller.stripe_account_id === rawAccountId &&
      isStripeConfigured()
    ) {
      try {
        const stripe = getStripe();
        const account = await stripe.accounts.retrieve(seller.stripe_account_id);
        const metaEmail = account.metadata?.seller_email?.trim().toLowerCase();
        if (!metaEmail || metaEmail === cleanEmail) {
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
        }
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

    const enrichedListings = (
      await enrichListingsWithStripeState(sellerListings)
    ).map(({ seller_stripe_account_id: _omit, ...rest }) => rest);

    return NextResponse.json({
      seller,
      listings: enrichedListings,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/stripe/connect:", err);
    return NextResponse.json(
      { error: "Failed to check seller Stripe status" },
      { status: 500 }
    );
  }
}

// POST /api/stripe/connect - Create/resume a Stripe Connect account for the seller and return a hosted onboarding URL
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(request, "stripe-connect", 15, 10 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many onboarding attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

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
    const origin = getSafeSiteOrigin(request);

    let existingSeller = await getSellerByEmail(cleanEmail, {
      refreshFromStripe: true,
    });
    let stripeAccountId = existingSeller?.stripe_account_id || "";

    // Prevent unauthenticated re-onboarding / bank detail modification once onboarding is complete
    if (
      existingSeller?.onboarding_complete &&
      existingSeller?.charges_enabled
    ) {
      return NextResponse.json({
        alreadyOnboarded: true,
        stripe_account_id: existingSeller.stripe_account_id,
        seller: existingSeller,
      });
    }

    // Verify existing unfinished account still exists in Stripe sandbox
    if (stripeAccountId) {
      try {
        const account = await stripe.accounts.retrieve(stripeAccountId);
        if (account.charges_enabled && account.details_submitted) {
          existingSeller = await saveSellerAccount({
            email: cleanEmail,
            stripe_account_id: account.id,
            onboarding_complete: true,
            charges_enabled: true,
            payouts_enabled: Boolean(account.payouts_enabled),
            details_submitted: true,
          });
          return NextResponse.json({
            alreadyOnboarded: true,
            stripe_account_id: existingSeller.stripe_account_id,
            seller: existingSeller,
          });
        }
      } catch {
        stripeAccountId = "";
      }
    }

    // Create a new Stripe Connect Standard account (US) for Direct Charges
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: "US",
        email: cleanEmail,
        business_type: "individual",
        business_profile: {
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
