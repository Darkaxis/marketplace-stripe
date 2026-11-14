"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MapPin,
  Search,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Plus,
  PackageOpen,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Listing } from "@/lib/supabase";
import { CATEGORIES, getCategoryLabel } from "@/lib/categories";
import { formatPrice, formatRelativeTime, cn } from "@/lib/utils";
import { isSafeDisplayImageUrl } from "@/lib/validation";

interface ItemGridProps {
  initialCategory?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  title?: string;
  subtitle?: string;
  showCategoryPills?: boolean;
}

export function ItemGrid({
  initialCategory = "all",
  searchQuery = "",
  onSearchChange,
  title = "Today's picks",
  subtitle,
  showCategoryPills = true,
}: ItemGridProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [localSearch, setLocalSearch] = useState<string>(searchQuery);

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (activeCategory && activeCategory !== "all") {
        params.set("category", activeCategory);
      }
      if (localSearch.trim()) {
        params.set("search", localSearch.trim());
      }

      const queryString = params.toString();
      const response = await fetch(
        `/api/listings${queryString ? `?${queryString}` : ""}`
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load listings");
      }

      const data = await response.json();
      setListings(data.listings || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  }, [activeCategory, localSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchListings();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchListings]);

  const handleSeedDemoData = async () => {
    try {
      setSeeding(true);
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      if (res.ok) {
        await fetchListings();
      }
    } catch (err) {
      console.error("Failed to seed listings:", err);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Header Row: Title, Location & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#050505] sm:text-2xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Inline search input for quick filtering */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              type="search"
              placeholder="Filter items..."
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              className="h-9 rounded-full border-gray-200 bg-white pl-9 pr-3 text-sm shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1877F2] shadow-2xs border border-gray-200/80">
            <MapPin className="h-3.5 w-3.5" />
            <span>Palo Alto · 40 mi</span>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      {showCategoryPills && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
              activeCategory === "all"
                ? "bg-[#1877F2] text-white shadow-xs"
                : "bg-white text-gray-700 hover:bg-[#E4E6EB] border border-gray-200/80"
            )}
          >
            All Categories
          </button>
          {CATEGORIES.slice(0, 10).map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setActiveCategory(cat.slug)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
                activeCategory === cat.slug
                  ? "bg-[#1877F2] text-white shadow-xs"
                  : "bg-white text-gray-700 hover:bg-[#E4E6EB] border border-gray-200/80"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/70 p-8 text-center">
          <AlertCircle className="mb-2 h-10 w-10 text-red-500" />
          <h3 className="text-base font-semibold text-red-900">
            Unable to load listings
          </h3>
          <p className="mt-1 max-w-md text-sm text-red-700">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchListings}
            className="mt-4 border-red-300 bg-white text-red-700 hover:bg-red-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      )}

      {/* Loading Skeleton Grid */}
      {loading && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <Card
              key={idx}
              className="overflow-hidden border-none bg-white shadow-xs"
            >
              <div className="aspect-square w-full animate-pulse bg-gray-200" />
              <CardContent className="space-y-2 p-3">
                <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && listings.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center shadow-2xs">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E7F3FF] text-[#1877F2]">
            <PackageOpen className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#050505]">
            No listings found
          </h3>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            {localSearch || (activeCategory && activeCategory !== "all")
              ? "We couldn't find any items matching your current search or category filter. Try clearing your filters or create a new listing."
              : "Your marketplace database doesn't have any listings yet. Be the first to list an item for sale or load sample marketplace listings!"}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {(localSearch ||
              (activeCategory && activeCategory !== "all")) && (
              <Button
                variant="secondary"
                onClick={() => {
                  setLocalSearch("");
                  setActiveCategory("all");
                  onSearchChange?.("");
                }}
              >
                Clear Filters
              </Button>
            )}
            <Button asChild className="bg-[#1877F2] hover:bg-[#166FE5]">
              <Link href="/create/item">
                <Plus className="mr-1.5 h-4 w-4" />
                Create New Listing
              </Link>
            </Button>
            {!localSearch && activeCategory === "all" && (
              <Button
                variant="outline"
                onClick={handleSeedDemoData}
                disabled={seeding}
              >
                {seeding ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4 text-[#1877F2]" />
                )}
                Load Sample Listings
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Listings Responsive Grid (1-5 columns based on screen size) */}
      {!loading && !error && listings.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {listings.map((item) => (
            <ListingCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({ item }: { item: Listing }) {
  const [imgError, setImgError] = useState(false);

  return (
    <Link href={`/item/${item.id}`} className="group block focus:outline-none">
      <Card className="h-full overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-2xs transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        {/* Square Image Container */}
        <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
          {isSafeDisplayImageUrl(item.image_url) && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url!}
              alt={item.title}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400">
              <ImageIcon className="mb-1.5 h-10 w-10 stroke-[1.5]" />
              <span className="text-xs font-medium">No photo provided</span>
            </div>
          )}

          {/* Category Pill Overlay */}
          <div className="absolute left-2.5 top-2.5">
            <Badge
              variant="secondary"
              className="bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-xs hover:bg-black/75"
            >
              {getCategoryLabel(item.category)}
            </Badge>
          </div>
        </div>

        {/* Item Info */}
        <CardContent className="p-3">
          <div className="text-[17px] font-bold leading-snug text-[#050505]">
            {formatPrice(item.price)}
          </div>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-normal leading-snug text-[#050505] group-hover:text-[#1877F2]">
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
            <span className="truncate">{item.location || "Palo Alto, CA"}</span>
            <span className="shrink-0 pl-2">
              {formatRelativeTime(item.created_at)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
