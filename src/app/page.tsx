"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { ItemGrid } from "@/components/marketplace/item-grid";

function MarketplaceHomeContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("search") || "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    setSearchQuery(searchParams.get("search") || "");
  }, [searchParams]);

  return (
    <div className="flex flex-1">
      <Sidebar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategorySelect={setSelectedCategory}
      />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px]">
          <ItemGrid
            initialCategory={selectedCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            title="Today's picks"
            subtitle="Items listed by sellers in your local community"
          />
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 p-6">
          <div className="h-96 w-full animate-pulse rounded-xl bg-gray-200" />
        </div>
      }
    >
      <MarketplaceHomeContent />
    </Suspense>
  );
}
