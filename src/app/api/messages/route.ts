import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  SAMPLE_LISTINGS,
  type Message,
} from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { sendSellerNotificationEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isValidEmail,
  isValidUuid,
  maskEmail,
} from "@/lib/validation";

function getSafeSiteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Fall through to request origin check
    }
  }

  const origin = request.nextUrl.origin;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.origin;
    }
  } catch {
    // ignore
  }
  return "";
}

// GET /api/messages - Get anonymized inquiry activity for a listing (no raw buyer/seller PII exposed)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const listingId =
      searchParams.get("listing_id") || searchParams.get("listingId");

    if (!isValidUuid(listingId)) {
      return NextResponse.json(
        { error: "A valid listing_id UUID parameter is required" },
        { status: 400 }
      );
    }

    const cleanListingId = listingId.trim();

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      const { data, error } = await db
        .from("messages")
        .select("id, listing_id, buyer_email, created_at")
        .eq("listing_id", cleanListingId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        console.error("Supabase messages fetch error:", error);
        return NextResponse.json(
          { error: "Failed to fetch messages" },
          { status: 500 }
        );
      }

      const anonymized = (data || []).map((row) => ({
        id: row.id,
        listing_id: row.listing_id,
        buyer_label: maskEmail(row.buyer_email),
        created_at: row.created_at,
      }));

      return NextResponse.json({
        count: anonymized.length,
        messages: anonymized,
      });
    }

    const messages = memoryStore.getMessagesByListing(cleanListingId);
    const anonymized = messages.map((row) => ({
      id: row.id,
      listing_id: row.listing_id,
      buyer_label: maskEmail(row.buyer_email),
      created_at: row.created_at,
    }));

    return NextResponse.json({
      count: anonymized.length,
      messages: anonymized,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/messages:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/messages - Store a buyer message in Supabase and trigger an email to the verified listing seller
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(request, "messages-send", 10, 10 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error:
            "Too many messages sent recently. Please wait a few minutes before sending another inquiry.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json();
    const { listing_id, buyer_email, message } = body ?? {};

    if (!isValidUuid(listing_id)) {
      return NextResponse.json(
        { error: "A valid listing ID is required" },
        { status: 400 }
      );
    }
    const cleanListingId = listing_id.trim();

    if (!isValidEmail(buyer_email)) {
      return NextResponse.json(
        { error: "A valid buyer email address is required" },
        { status: 400 }
      );
    }
    const cleanBuyerEmail = buyer_email.trim();

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message content cannot be empty" },
        { status: 400 }
      );
    }
    const cleanMessageBody = message.trim();
    if (cleanMessageBody.length > 2000) {
      return NextResponse.json(
        { error: "Message cannot exceed 2,000 characters" },
        { status: 400 }
      );
    }

    const origin = getSafeSiteOrigin(request);
    const listingUrl = origin
      ? `${origin}/item/${encodeURIComponent(cleanListingId)}`
      : undefined;

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();

      // Always verify the listing exists and derive seller_email strictly from DB (prevents arbitrary email relay spoofing)
      const { data: listing, error: listingErr } = await db
        .from("listings")
        .select("id, title, price, seller_email")
        .eq("id", cleanListingId)
        .single();

      if (listingErr || !listing) {
        // Check if it's an unseeded sample listing
        const sampleListing = SAMPLE_LISTINGS.find(
          (item) => item.id === cleanListingId
        );
        if (!sampleListing) {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }

        // For static demo sample listings not yet inserted into DB, require seeding first or send safely to memory
        return NextResponse.json(
          { error: "Please load sample listings into the database before messaging" },
          { status: 404 }
        );
      }

      const verifiedSellerEmail = listing.seller_email?.trim();
      if (!isValidEmail(verifiedSellerEmail)) {
        return NextResponse.json(
          { error: "Listing seller contact information is unavailable" },
          { status: 400 }
        );
      }

      const cleanMessage = {
        listing_id: cleanListingId,
        buyer_email: cleanBuyerEmail,
        seller_email: verifiedSellerEmail,
        message: cleanMessageBody,
      };

      const { data, error } = await db
        .from("messages")
        .insert([cleanMessage])
        .select("id, listing_id, created_at")
        .single();

      if (error || !data) {
        console.error("Supabase send message error:", error);
        return NextResponse.json(
          { error: "Failed to save message" },
          { status: 500 }
        );
      }

      const emailResult = await sendSellerNotificationEmail({
        sellerEmail: verifiedSellerEmail,
        buyerEmail: cleanBuyerEmail,
        message: cleanMessageBody,
        listingId: cleanListingId,
        listingTitle: listing.title,
        listingPrice: listing.price,
        listingUrl,
      });

      return NextResponse.json(
        {
          message: {
            id: data.id,
            listing_id: data.listing_id,
            buyer_label: maskEmail(cleanBuyerEmail),
            own_message: cleanMessageBody,
            created_at: data.created_at,
          },
          emailSent: emailResult.sent,
          emailProvider: emailResult.provider,
        },
        { status: 201 }
      );
    }

    // Fallback store mode
    const fallbackListing = memoryStore.getListingById(cleanListingId);
    if (!fallbackListing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    const newMessage: Message = {
      id: crypto.randomUUID(),
      listing_id: cleanListingId,
      buyer_email: cleanBuyerEmail,
      seller_email: fallbackListing.seller_email,
      message: cleanMessageBody,
      created_at: new Date().toISOString(),
    };

    memoryStore.addMessage(newMessage);

    const emailResult = await sendSellerNotificationEmail({
      sellerEmail: fallbackListing.seller_email,
      buyerEmail: cleanBuyerEmail,
      message: cleanMessageBody,
      listingId: cleanListingId,
      listingTitle: fallbackListing.title,
      listingPrice: fallbackListing.price,
      listingUrl,
    });

    return NextResponse.json(
      {
        message: {
          id: newMessage.id,
          listing_id: newMessage.listing_id,
          buyer_label: maskEmail(cleanBuyerEmail),
          own_message: cleanMessageBody,
          created_at: newMessage.created_at,
        },
        emailSent: emailResult.sent,
        emailProvider: emailResult.provider,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Unexpected error in POST /api/messages:", err);
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 }
    );
  }
}
