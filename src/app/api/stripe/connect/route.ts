import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  enrichListingsWithStripeState,
  getSellerByEmail,
  saveSellerAccount,
  sellerInputFromStripeAccount,
} from "@/lib/stripe-db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSafeSiteOrigin, isValidEmail } from "@/lib/validation";

// GET /api/stripe/connect?email=... - Check a seller's Stripe Connect onboarding status & their listings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawEmail = searchParams.get("email")?.trim() || "";

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

    // Look up & refresh the account bound to this email in Supabase
    const seller = await getSellerByEmail(cleanEmail, {
      refreshFromStripe: true,
    });

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
    let isNoDashboardAccount = false;

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
          existingSeller = await saveSellerAccount(
            sellerInputFromStripeAccount(cleanEmail, account)
          );
          return NextResponse.json({
            alreadyOnboarded: true,
            stripe_account_id: existingSeller.stripe_account_id,
            seller: existingSeller,
          });
        }

        const dashboardType = account.controller?.stripe_dashboard?.type;
        if (!account.details_submitted && dashboardType !== "none") {
          // Replace unfinished legacy Standard account (which prompts for a Stripe password)
          // with a passwordless Accounts v2 (`dashboard: "none"`) account.
          stripeAccountId = "";
        } else {
          isNoDashboardAccount = dashboardType === "none";
        }
      } catch {
        stripeAccountId = "";
      }
    }

    // Create a new Stripe Connect Accounts v2 account (US, dashboard: "none")
    // so test sellers are not prompted to create a Stripe account password
    if (!stripeAccountId) {
      const account = await stripe.v2.core.accounts.create({
        contact_email: cleanEmail,
        display_name: cleanEmail,
        dashboard: "none",
        identity: {
          country: "us",
          entity_type: "individual",
        },
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "stripe",
          },
          profile: {
            product_description: "Marketplace seller items",
          },
        },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
            },
          },
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        metadata: {
          seller_email: cleanEmail,
          platform: "marketplace-stripe",
        },
      });

      stripeAccountId = account.id;
      isNoDashboardAccount = true;

      existingSeller = await saveSellerAccount({
        email: cleanEmail,
        stripe_account_id: stripeAccountId,
        onboarding_complete: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }

    // Create a hosted Stripe Account Onboarding link
    const returnUrl = `${origin}/connect?email=${encodeURIComponent(
      cleanEmail
    )}&account_id=${encodeURIComponent(stripeAccountId)}&onboarding=complete`;
    const refreshUrl = `${origin}/connect?email=${encodeURIComponent(
      cleanEmail
    )}&account_id=${encodeURIComponent(stripeAccountId)}&refresh=1`;

    const accountLinkUrl = isNoDashboardAccount
      ? (
          await stripe.v2.core.accountLinks.create({
            account: stripeAccountId,
            use_case: {
              type: "account_onboarding",
              account_onboarding: {
                refresh_url: refreshUrl,
                return_url: returnUrl,
              },
            },
          })
        ).url
      : (
          await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: "account_onboarding",
          })
        ).url;

    return NextResponse.json({
      url: accountLinkUrl,
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
