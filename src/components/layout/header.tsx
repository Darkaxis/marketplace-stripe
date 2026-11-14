"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Store,
  Search,
  Plus,
  Home,
  Menu,
  X,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/?search=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/");
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 h-14 w-full border-b border-gray-200 bg-white shadow-xs">
      <div className="mx-auto flex h-full max-w-[1920px] items-center justify-between px-3 sm:px-4">
        {/* Left: Brand Logo & Global Search */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 focus:outline-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-white shadow-xs transition-transform hover:scale-105">
              <Store className="h-5 w-5" />
            </div>
            <span className="hidden text-xl font-bold tracking-tight text-[#050505] sm:inline-block">
              Marketplace
            </span>
          </Link>

          <form
            onSubmit={handleSearchSubmit}
            className="relative hidden md:block"
          >
            <Search className=" absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              type="search"
              placeholder="Search Marketplace"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-60 rounded-full border-none bg-[#F0F2F5] pl-9 pr-4 text-sm focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#1877F2] xl:w-72"
            />
          </form>
        </div>

        {/* Center: Tab Navigation */}
        <nav className="hidden h-full items-center justify-center gap-1 lg:flex">
          <Link
            href="/"
            className={cn(
              "relative flex h-full w-28 items-center justify-center rounded-lg transition-colors hover:bg-[#F0F2F5]",
              pathname === "/"
                ? "text-[#1877F2] hover:bg-transparent"
                : "text-gray-500"
            )}
            title="Browse Marketplace"
          >
            <Store className="h-6 w-6" />
            {pathname === "/" && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[#1877F2]" />
            )}
          </Link>

          <Link
            href="/category/electronics"
            className={cn(
              "relative flex h-full w-28 items-center justify-center rounded-lg transition-colors hover:bg-[#F0F2F5]",
              pathname?.startsWith("/category")
                ? "text-[#1877F2] hover:bg-transparent"
                : "text-gray-500"
            )}
            title="Categories"
          >
            <Tag className="h-6 w-6" />
            {pathname?.startsWith("/category") && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[#1877F2]" />
            )}
          </Link>

          <Link
            href="/create/item"
            className={cn(
              "relative flex h-full w-28 items-center justify-center rounded-lg transition-colors hover:bg-[#F0F2F5]",
              pathname?.startsWith("/create")
                ? "text-[#1877F2] hover:bg-transparent"
                : "text-gray-500"
            )}
            title="Create Listing"
          >
            <Plus className="h-6 w-6" />
            {pathname?.startsWith("/create") && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[#1877F2]" />
            )}
          </Link>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="rounded-full bg-[#E7F3FF] px-3.5 font-semibold text-[#1877F2] shadow-none hover:bg-[#DBE7F2]"
          >
            <Link href="/create/item">
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Sell</span>
            </Link>
          </Button>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E4E6EB] text-[#050505] lg:hidden"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-14 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-gray-200 bg-white p-4 shadow-lg lg:hidden">
          <form onSubmit={handleSearchSubmit} className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              type="search"
              placeholder="Search Marketplace..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-full border-none bg-[#F0F2F5] pl-9 pr-4 text-sm"
            />
          </form>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              asChild
              variant="secondary"
              className="justify-start font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Browse All
              </Link>
            </Button>
            <Button
              asChild
              className="justify-start bg-[#1877F2] font-semibold text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Link href="/create/item">
                <Plus className="mr-2 h-4 w-4" />
                Create Listing
              </Link>
            </Button>
          </div>

          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Categories
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.slug}
                  href={`/category/${category.slug}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-700 hover:bg-[#F0F2F5]"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E4E6EB]">
                    <Icon className="h-4 w-4 text-gray-700" />
                  </div>
                  <span className="truncate">{category.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
