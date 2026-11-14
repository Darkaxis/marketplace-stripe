"use client";

import React, { useState, useRef, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  X,
  MapPin,
  DollarSign,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ImageIcon,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, getCategoryBySlug, getCategoryLabel } from "@/lib/categories";
import { formatPrice, cn } from "@/lib/utils";

function CreateItemFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rawDefaultCat = searchParams.get("category") || "electronics";
  const defaultCat = getCategoryBySlug(rawDefaultCat)?.slug || "electronics";

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(defaultCat);
  const [location, setLocation] = useState("Palo Alto, CA");
  const [description, setDescription] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    const paramCat = searchParams.get("category");
    const verifiedCat = paramCat ? getCategoryBySlug(paramCat)?.slug : undefined;
    if (verifiedCat) {
      setCategory(verifiedCat);
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = async (file: File) => {
    setError(null);

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError("Please select a valid image file (JPG, PNG, WebP, or GIF).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB.");
      return;
    }

    // Immediate local object URL preview (never persisted to DB)
    const localObjectUrl = URL.createObjectURL(file);
    setPreviewUrl(localObjectUrl);
    setImageUrl("");

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload image");
      }

      setImageUrl(data.url);
    } catch (err) {
      URL.revokeObjectURL(localObjectUrl);
      setPreviewUrl("");
      setImageUrl("");
      setError(
        err instanceof Error
          ? err.message
          : "Image upload failed. Please try again."
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const clearImage = () => {
    setPreviewUrl("");
    setImageUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = "Please enter a title for your listing.";
    } else if (title.trim().length < 3) {
      errors.title = "Title must be at least 3 characters.";
    }

    const numericPrice = parseFloat(price);
    if (price.trim() === "" || isNaN(numericPrice) || numericPrice < 0) {
      errors.price = "Please enter a valid non-negative price.";
    }

    if (!category) {
      errors.category = "Please select a category.";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!sellerEmail.trim() || !emailRegex.test(sellerEmail.trim())) {
      errors.sellerEmail = "Please enter a valid contact email address.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/api/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          price: parseFloat(price),
          category,
          location: location.trim() || "Palo Alto, CA",
          description: description.trim(),
          seller_email: sellerEmail.trim(),
          image_url: imageUrl || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create listing");
      }

      setSuccessId(data.listing.id);
      setTimeout(() => {
        router.push(`/item/${data.listing.id}`);
      }, 900);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while publishing your listing."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayImage = previewUrl || imageUrl;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Left Panel: Create Listing Form */}
      <aside className="w-full shrink-0 border-b border-gray-200 bg-white p-4 sm:p-6 lg:w-[400px] lg:border-b-0 lg:border-r xl:w-[430px]">
        <div className="mb-4">
          <Link
            href="/"
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#1877F2]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Marketplace
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[#050505]">
              Item for sale
            </h1>
            <Badge
              variant="secondary"
              className="bg-[#E7F3FF] text-xs font-semibold text-[#1877F2]"
            >
              Public Listing
            </Badge>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {successId && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Listing published successfully!</p>
              <p className="mt-0.5">Redirecting you to your listing page...</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo Upload Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Photos · {displayImage ? "1/1" : "0/1"}
              </Label>
              {uploadingImage && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1877F2]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading to storage...
                </span>
              )}
            </div>

            {!displayImage ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                  isDragging
                    ? "border-[#1877F2] bg-[#E7F3FF]/50"
                    : "border-gray-300 bg-gray-50/60 hover:border-[#1877F2] hover:bg-gray-50"
                )}
              >
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#E4E6EB] text-[#050505]">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-[#050505]">
                  Add photo
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  or drag and drop (JPG, PNG, WebP up to 5MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayImage}
                  alt="Upload preview"
                  className="h-44 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black"
                  title="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <Separator />

          {/* Required Item Details */}
          <div className="space-y-3.5">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                maxLength={255}
                placeholder="What are you selling?"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title) {
                    setFieldErrors((prev) => ({ ...prev, title: "" }));
                  }
                }}
                className={cn(fieldErrors.title && "border-red-500")}
              />
              {fieldErrors.title && (
                <p className="text-xs text-red-600">{fieldErrors.title}</p>
              )}
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <Label htmlFor="price">
                Price <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    if (fieldErrors.price) {
                      setFieldErrors((prev) => ({ ...prev, price: "" }));
                    }
                  }}
                  className={cn(
                    "pl-9",
                    fieldErrors.price && "border-red-500"
                  )}
                />
              </div>
              {fieldErrors.price && (
                <p className="text-xs text-red-600">{fieldErrors.price}</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="category">
                Category <span className="text-red-500">*</span>
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.slug} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.category && (
                <p className="text-xs text-red-600">{fieldErrors.category}</p>
              )}
            </div>

            {/* Seller Email */}
            <div className="space-y-1.5">
              <Label htmlFor="seller_email">
                Your Contact Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  id="seller_email"
                  type="email"
                  maxLength={255}
                  placeholder="you@example.com"
                  value={sellerEmail}
                  onChange={(e) => {
                    setSellerEmail(e.target.value);
                    if (fieldErrors.sellerEmail) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        sellerEmail: "",
                      }));
                    }
                  }}
                  className={cn(
                    "pl-9",
                    fieldErrors.sellerEmail && "border-red-500"
                  )}
                />
              </div>
              {fieldErrors.sellerEmail && (
                <p className="text-xs text-red-600">
                  {fieldErrors.sellerEmail}
                </p>
              )}
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  id="location"
                  maxLength={255}
                  placeholder="Palo Alto, CA"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={4}
                maxLength={5000}
                placeholder="Describe your item's condition, specs, included accessories, and pickup details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={submitting || uploadingImage}
              className="h-11 w-full bg-[#1877F2] text-[15px] font-semibold text-white hover:bg-[#166FE5]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing Listing...
                </>
              ) : (
                "Publish Listing"
              )}
            </Button>
          </div>
        </form>
      </aside>

      {/* Right Panel: Real-Time Live Preview */}
      <main className="flex flex-1 flex-col items-center justify-center bg-[#F0F2F5] p-4 sm:p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Live Preview
            </span>
            <span className="text-xs text-gray-500">
              Updates automatically as you type
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left Image Preview Area */}
              <div className="relative flex min-h-[320px] items-center justify-center bg-neutral-900 lg:col-span-7 lg:min-h-[480px]">
                {displayImage ? (
                  <>
                    {/* Blurred backdrop */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayImage}
                      alt=""
                      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
                    />
                    {/* Main preview image */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayImage}
                      alt={title || "Preview"}
                      className="relative z-10 max-h-[440px] w-full object-contain p-4"
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-400">
                    <ImageIcon className="mb-3 h-14 w-14 stroke-[1.2]" />
                    <p className="text-base font-semibold text-neutral-200">
                      Your listing photo preview
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-neutral-400">
                      Upload a photo on the left to see how your listing will
                      appear to buyers on Marketplace.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Details Preview Area */}
              <div className="flex flex-col justify-between p-6 lg:col-span-5">
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="bg-[#E7F3FF] text-[#1877F2]"
                      >
                        {getCategoryLabel(category)}
                      </Badge>
                    </div>
                    <h2 className="wrap-break-word text-xl font-bold text-[#050505]">
                      {title.trim() || "Title"}
                    </h2>
                    <p className="mt-1 text-2xl font-extrabold text-[#1877F2]">
                      {price.trim() !== ""
                        ? formatPrice(price)
                        : "$0"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Listed just now in{" "}
                      <span className="font-medium text-gray-700">
                        {location.trim() || "Palo Alto, CA"}
                      </span>
                    </p>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-bold text-[#050505]">
                      Details
                    </h3>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                      <span>Category</span>
                      <span className="font-medium text-[#050505]">
                        {getCategoryLabel(category)}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                      {description.trim() ||
                        "Description will appear here once you start typing..."}
                    </p>
                  </div>

                  <Separator />

                  {/* Seller Information Preview */}
                  <div>
                    <h3 className="mb-2.5 text-sm font-bold text-[#050505]">
                      Seller information
                    </h3>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-[#1877F2] text-sm font-bold text-white">
                          {(sellerEmail.trim()[0] || "S").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#050505]">
                          {sellerEmail.trim() || "seller@example.com"}
                        </p>
                        <p className="text-xs text-gray-500">
                          Marketplace Seller · {location.trim() || "Palo Alto, CA"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview Message Box (Disabled in Preview) */}
                <div className="mt-6 rounded-xl border border-gray-200 bg-[#F0F2F5]/70 p-3.5 opacity-80">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <MessageCircle className="h-4 w-4 text-[#1877F2]" />
                    <span>Send seller a message</span>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-xs text-gray-500 border border-gray-200">
                    Hi, is this still available?
                  </div>
                  <Button
                    type="button"
                    disabled
                    className="mt-2.5 h-8 w-full bg-[#1877F2] text-xs font-semibold text-white"
                  >
                    Send Message
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CreateItemPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#1877F2]" />
        </div>
      }
    >
      <CreateItemFormContent />
    </Suspense>
  );
}
