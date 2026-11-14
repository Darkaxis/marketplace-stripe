import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, SAMPLE_LISTINGS } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { isValidUuid } from "@/lib/validation";

// GET /api/listings/[id] - Get a specific listing by UUID
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
        const sampleMatch = SAMPLE_LISTINGS.find((item) => item.id === id);
        if (sampleMatch) {
          return NextResponse.json({ listing: sampleMatch });
        }

        return NextResponse.json(
          { error: "Listing not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ listing: data });
    }

    const listing = memoryStore.getListingById(id);
    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ listing });
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/[id]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
