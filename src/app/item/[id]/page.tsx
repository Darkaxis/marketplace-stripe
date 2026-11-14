import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ItemDetailClient } from "@/components/marketplace/item-detail-client";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-10 w-10 animate-spin text-[#1877F2]" />
        </div>
      }
    >
      <ItemDetailClient id={id} />
    </Suspense>
  );
}
