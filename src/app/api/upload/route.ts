import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { detectImageFormatFromBytes } from "@/lib/validation";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// POST /api/upload - Upload verified raster image to Supabase Storage ('listing-images' bucket)
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(request, "image-upload", 15, 10 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Please wait a few minutes and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must be between 1 byte and 5MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Validate true file content via magic bytes instead of trusting client filename or MIME header
    const detected = detectImageFormatFromBytes(buffer);
    if (!detected) {
      return NextResponse.json(
        {
          error:
            "Invalid or unsupported image file. Please upload a valid JPG, PNG, WebP, or GIF image.",
        },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      const db = getServerSupabaseClient();
      const fileName = `${crypto.randomUUID()}.${detected.ext}`;
      const filePath = `listings/${fileName}`;

      const { error: uploadError } = await db.storage
        .from("listing-images")
        .upload(filePath, buffer, {
          contentType: detected.mime,
          upsert: false,
        });

      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload image to storage" },
          { status: 500 }
        );
      }

      const {
        data: { publicUrl },
      } = db.storage.from("listing-images").getPublicUrl(filePath);

      return NextResponse.json({ url: publicUrl }, { status: 201 });
    }

    // Fallback when Supabase is not configured yet
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${detected.mime};base64,${base64}`;

    return NextResponse.json({ url: dataUrl, fallback: true }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/upload:", err);
    return NextResponse.json(
      { error: "Failed to process image upload" },
      { status: 500 }
    );
  }
}
