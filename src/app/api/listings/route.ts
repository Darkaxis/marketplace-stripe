import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  SAMPLE_LISTINGS,
  type Listing,
} from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  hasControlChars,
  isValidCategorySlug,
  isValidEmail,
  sanitizePostgrestSearch,
  validateSafeImageUrl,
} from "@/lib/validation";

const MAX_LISTING_PRICE = 99_999_999.99;

// GET /api/listings - Browse listings with optional search and category filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCategory = searchParams.get("category")?.trim().toLowerCase() ?? "";
    const rawSearch =
      searchParams.get("search") || searchParams.get("q") || "";

    const safeSearch = sanitizePostgrestSearch(rawSearch).toLowerCase();

    if (
      rawCategory &&
      rawCategory !== "all" &&
      !/^[a-z0-9-]+$/.test(rawCategory)
    ) {
      return NextResponse.json(
        { error: "Invalid category parameter" },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      // Select only public listing fields needed for the browse grid (omit bulk seller_email)
      let query = db
        .from("listings")
        .select(
          "id, title, description, price, category, image_url, location, created_at, updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (rawCategory && rawCategory !== "all") {
        query = query.eq("category", rawCategory);
      }

      if (safeSearch) {
        query = query.or(
          `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,location.ilike.%${safeSearch}%`
        );
      }

      const { data, error } = await query;

      if (error) {
        console.error("Supabase listings fetch error:", error);
        return NextResponse.json(
          { error: "Failed to fetch listings" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        listings: data || [],
        source: "supabase",
      });
    }

    // Fallback when Supabase credentials are not configured yet
    let listings = memoryStore.getListings();

    if (rawCategory && rawCategory !== "all") {
      listings = listings.filter(
        (item) => item.category.toLowerCase() === rawCategory
      );
    }

    if (safeSearch) {
      listings = listings.filter(
        (item) =>
          item.title.toLowerCase().includes(safeSearch) ||
          (item.description &&
            item.description.toLowerCase().includes(safeSearch)) ||
          item.location.toLowerCase().includes(safeSearch) ||
          item.category.toLowerCase().includes(safeSearch)
      );
    }

    return NextResponse.json({
      listings: listings.slice(0, 100).map(({ seller_email: _omit, ...rest }) => rest),
      source: "fallback",
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/listings:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/listings - Create a new listing (or seed demo listings when empty)
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(request, "listings-create", 20, 10 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json();

    // Optional seed action only allowed when the listings table is empty
    if (body?.action === "seed") {
      if (isSupabaseConfigured()) {
        const db = getServerSupabaseClient();
        const { data: existing, error: existingErr } = await db
          .from("listings")
          .select("id")
          .limit(1);

        if (existingErr) {
          console.error("Supabase seed check error:", existingErr);
          return NextResponse.json(
            { error: "Failed to check existing listings" },
            { status: 500 }
          );
        }

        if (existing && existing.length > 0) {
          return NextResponse.json(
            { error: "Sample listings can only be loaded into an empty database" },
            { status: 409 }
          );
        }

        const seedRows = SAMPLE_LISTINGS.map(
          ({
            title,
            description,
            price,
            category,
            seller_email,
            image_url,
            location,
          }) => ({
            title,
            description,
            price,
            category,
            seller_email,
            image_url,
            location,
          })
        );
        const { data, error } = await db
          .from("listings")
          .insert(seedRows)
          .select();

        if (error) {
          console.error("Supabase seed insert error:", error);
          return NextResponse.json(
            { error: "Failed to seed listings" },
            { status: 500 }
          );
        }

        return NextResponse.json(
          { listings: data, message: "Sample listings seeded successfully" },
          { status: 201 }
        );
      }

      return NextResponse.json(
        {
          listings: memoryStore.getListings(),
          message: "Sample listings loaded",
        },
        { status: 200 }
      );
    }

    const {
      title,
      description,
      price,
      category,
      seller_email,
      image_url,
      location,
    } = body ?? {};

    // Input validation & length bounds matching SQL schema
    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }
    const cleanTitle = title.trim();
    if (
      cleanTitle.length < 3 ||
      cleanTitle.length > 255 ||
      hasControlChars(cleanTitle)
    ) {
      return NextResponse.json(
        { error: "Title must be between 3 and 255 characters" },
        { status: 400 }
      );
    }

    const numericPrice = Number(price);
    if (
      price === undefined ||
      price === null ||
      price === "" ||
      !Number.isFinite(numericPrice) ||
      numericPrice < 0 ||
      numericPrice > MAX_LISTING_PRICE
    ) {
      return NextResponse.json(
        {
          error: `Price must be between 0 and ${MAX_LISTING_PRICE.toLocaleString()}`,
        },
        { status: 400 }
      );
    }
    const roundedPrice = Math.round(numericPrice * 100) / 100;

    if (!isValidCategorySlug(category)) {
      return NextResponse.json(
        { error: "Please select a valid marketplace category" },
        { status: 400 }
      );
    }
    const cleanCategory = category.trim().toLowerCase();

    if (!isValidEmail(seller_email)) {
      return NextResponse.json(
        { error: "A valid seller email address is required" },
        { status: 400 }
      );
    }
    const cleanEmail = seller_email.trim();

    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return NextResponse.json(
          { error: "Invalid description format" },
          { status: 400 }
        );
      }
      const trimmedDesc = description.trim();
      if (trimmedDesc.length > 5000) {
        return NextResponse.json(
          { error: "Description cannot exceed 5,000 characters" },
          { status: 400 }
        );
      }
      cleanDescription = trimmedDesc || null;
    }

    let cleanLocation = "Palo Alto, CA";
    if (location !== undefined && location !== null) {
      if (typeof location !== "string") {
        return NextResponse.json(
          { error: "Invalid location format" },
          { status: 400 }
        );
      }
      const trimmedLoc = location.trim();
      if (trimmedLoc.length > 255 || hasControlChars(trimmedLoc)) {
        return NextResponse.json(
          { error: "Location must be under 255 characters" },
          { status: 400 }
        );
      }
      if (trimmedLoc) {
        cleanLocation = trimmedLoc;
      }
    }

    const imageValidation = validateSafeImageUrl(
      image_url,
      !isSupabaseConfigured()
    );
    if (!imageValidation.valid) {
      return NextResponse.json(
        { error: imageValidation.error || "Invalid image URL" },
        { status: 400 }
      );
    }

    const cleanListingData = {
      title: cleanTitle,
      description: cleanDescription,
      price: roundedPrice,
      category: cleanCategory,
      seller_email: cleanEmail,
      image_url: imageValidation.value,
      location: cleanLocation,
    };

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      const { data, error } = await db
        .from("listings")
        .insert([cleanListingData])
        .select()
        .single();

      if (error) {
        console.error("Supabase create listing error:", error);
        return NextResponse.json(
          { error: "Failed to create listing" },
          { status: 500 }
        );
      }

      return NextResponse.json({ listing: data }, { status: 201 });
    }

    // Fallback when Supabase is not configured yet
    const newListing: Listing = {
      id: crypto.randomUUID(),
      ...cleanListingData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    memoryStore.addListing(newListing);
    return NextResponse.json({ listing: newListing }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/listings:", err);
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 }
    );
  }
}
