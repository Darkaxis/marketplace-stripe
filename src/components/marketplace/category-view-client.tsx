"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Tag } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { ItemGrid } from "@/components/marketplace/item-grid";
import { Button } from "@/components/ui/button";
import { getCategoryBySlug, getCategoryLabel } from "@/lib/categories";

export function CategoryViewClient({ slug }: { slug: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const categoryInfo = getCategoryBySlug(slug);
  const categoryName = categoryInfo?.name || getCategoryLabel(slug);
  const categoryDescription =
    categoryInfo?.description ||
    `Browse local ${categoryName.toLowerCase()} listings near Palo Alto, CA`;
  const Icon = categoryInfo?.icon || Tag;

  return (
    <div className="flex flex-1">
      <Sidebar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={slug}
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          {/* Category Hero Banner */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E7F3FF] text-[#1877F2]">
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1877F2] hover:underline"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Marketplace
                  </Link>
                  <span className="text-xs text-gray-400">/</span>
                  <span className="text-xs font-medium text-gray-500">
                    {categoryName}
                  </span>
                </div>
                <h1 className="mt-0.5 text-2xl font-bold text-[#050505]">
                  {categoryName}
                </h1>
                <p className="text-sm text-gray-500">{categoryDescription}</p>
              </div>
            </div>

            <Button asChild className="bg-[#1877F2] hover:bg-[#166FE5]">
              <Link href={`/create/item?category=${encodeURIComponent(slug)}`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Sell in {categoryName}
              </Link>
            </Button>
          </div>

          {/* Filtered Item Grid */}
          <ItemGrid
            initialCategory={slug}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            title={`${categoryName} near you`}
            subtitle={`Showing ${categoryName.toLowerCase()} listings in Palo Alto, CA`}
            showCategoryPills={false}
          />
        </div>
      </main>
    </div>
  );
}
