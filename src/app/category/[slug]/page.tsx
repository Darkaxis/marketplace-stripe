import React from "react";
import { CategoryViewClient } from "@/components/marketplace/category-view-client";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CategoryViewClient slug={slug} />;
}
