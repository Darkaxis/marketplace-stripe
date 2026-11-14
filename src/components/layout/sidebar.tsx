"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Store,
  ShoppingBag,
  Tag,
  Plus,
  Search,
  Settings,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

interface SidebarProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  selectedCategory?: string;
  onCategorySelect?: (slug: string) => void;
}

export function Sidebar({
  searchQuery = "",
  onSearchChange,
  selectedCategory,
  onCategorySelect,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [localSearch, setLocalSearch] = React.useState(searchQuery);

  React.useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const handleSearchInput = (value: string) => {
    setLocalSearch(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSearchChange) {
      const trimmed = localSearch.trim();
      router.push(
        trimmed ? `/?search=${encodeURIComponent(trimmed)}` : "/"
      );
    }
  };

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[340px] shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white p-4 lg:flex xl:w-[360px]">
      {/* Sidebar Header */}
      <div className="mb-3 flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#050505]">
          Marketplace
        </h1>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E4E6EB] text-[#050505] transition-colors hover:bg-[#D8DADF]"
          title="Marketplace Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          type="search"
          placeholder="Search Marketplace"
          value={localSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="h-10 rounded-full border-none bg-[#F0F2F5] pl-10 pr-4 text-sm placeholder:text-gray-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#1877F2]"
        />
      </form>

      {/* Main Navigation Links */}
      <div className="space-y-1">
        <Link
          href="/"
          onClick={(e) => {
            if (onCategorySelect && pathname === "/") {
              e.preventDefault();
              onCategorySelect("all");
            }
          }}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-semibold transition-colors",
            pathname === "/" && (!selectedCategory || selectedCategory === "all")
              ? "bg-[#E7F3FF] text-[#1877F2]"
              : "text-[#050505] hover:bg-[#F0F2F5]"
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              pathname === "/" &&
                (!selectedCategory || selectedCategory === "all")
                ? "bg-[#1877F2] text-white"
                : "bg-[#E4E6EB] text-[#050505]"
            )}
          >
            <Store className="h-5 w-5" />
          </div>
          <span>Browse all</span>
        </Link>

        <Link
          href="/create/item"
          className={cn(
            "flex items-center justify-between rounded-lg px-2.5 py-2 text-[15px] font-semibold transition-colors",
            pathname?.startsWith("/create")
              ? "bg-[#E7F3FF] text-[#1877F2]"
              : "text-[#050505] hover:bg-[#F0F2F5]"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full",
                pathname?.startsWith("/create")
                  ? "bg-[#1877F2] text-white"
                  : "bg-[#E4E6EB] text-[#050505]"
              )}
            >
              <Tag className="h-5 w-5" />
            </div>
            <span>Selling</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </Link>

        <Link
          href="/"
          className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[15px] font-medium text-[#050505] transition-colors hover:bg-[#F0F2F5]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E4E6EB] text-[#050505]">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <span>Buying</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </Link>
      </div>

      {/* Create New Listing CTA */}
      <div className="mt-3">
        <Button
          asChild
          className="h-10 w-full rounded-lg bg-[#E7F3FF] text-[15px] font-semibold text-[#1877F2] shadow-none hover:bg-[#DBE7F2]"
        >
          <Link href="/create/item">
            <Plus className="mr-1.5 h-4 w-4 stroke-[2.5]" />
            Create new listing
          </Link>
        </Button>
      </div>

      <Separator className="my-4" />

      {/* Categories List */}
      <div className="px-1">
        <h2 className="mb-2 text-[17px] font-semibold text-[#050505]">
          Categories
        </h2>
        <div className="space-y-0.5">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isActive =
              selectedCategory === category.slug ||
              pathname === `/category/${category.slug}`;

            return (
              <Link
                key={category.slug}
                href={`/category/${category.slug}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] font-medium transition-colors",
                  isActive
                    ? "bg-[#E7F3FF] font-semibold text-[#1877F2]"
                    : "text-[#050505] hover:bg-[#F0F2F5]"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    isActive
                      ? "bg-[#1877F2] text-white"
                      : "bg-[#E4E6EB] text-[#050505]"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="truncate">{category.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
