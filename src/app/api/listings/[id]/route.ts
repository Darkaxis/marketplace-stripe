import { NextRequest, NextResponse } from "next/server";
import {
  enrichListingsWithStripeState,
  getListingById,
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

    const rawListing = await getListingById(id);
    if (!rawListing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    let [enriched] = await enrichListingsWithStripeState([rawListing], {
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
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/[id]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
