import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import {
  enrichListingsWithStripeState,
  reconcilePendingCheckoutForListing,
} from "@/lib/stripe-db";
import { isValidUuid } from "@/lib/validation";

function toPublicDetailListing<
  T extends { seller_stripe_account_id?: string | null }
>(listing: T): Omit<T, "seller_stripe_account_id"> {
  const { seller_stripe_account_id: _omit, ...rest } = listing;
  return rest;
}

// GET /api/listings/[id] - Get a specific listing by UUID enriched with seller Stripe Connect & sold status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid listing ID" },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      const { data, error } = await db
        .from("listings")
        .select("*")
        .eq("id", id.trim())
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Listing not found" },
          { status: 404 }
        );
      }

      let [enriched] = await enrichListingsWithStripeState([data], {
        syncUnfinishedSellersWithStripe: true,
      });

      if (!enriched.sold) {
        const reconciledOrder = await reconcilePendingCheckoutForListing(
          enriched
        );
        if (reconciledOrder) {
          enriched = {
            ...enriched,
            status: "sold",
            sold: true,
          };
        }
      }

      return NextResponse.json({ listing: toPublicDetailListing(enriched) });
    }

    const listing = memoryStore.getListingById(id);
    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    const [enrichedFallback] = await enrichListingsWithStripeState([listing], {
      syncUnfinishedSellersWithStripe: true,
    });

    return NextResponse.json({
      listing: toPublicDetailListing(enrichedFallback),
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/[id]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
