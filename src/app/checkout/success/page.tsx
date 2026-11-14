"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  ImageIcon,
  Loader2,
  PackageCheck,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type Listing, type OrderRecord } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import { isSafeDisplayImageUrl } from "@/lib/validation";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") || "";
  const listingId = searchParams.get("listing_id") || "";
  const acct = searchParams.get("acct") || "";

  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing Stripe Checkout session ID.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function verifyOrder() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ session_id: sessionId });
        if (listingId) params.set("listing_id", listingId);
        if (acct) params.set("acct", acct);

        const res = await fetch(
          `/api/stripe/order-success?${params.toString()}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Could not verify order payment");
        }

        if (!cancelled) {
          setOrder(data.order);
          setListing(data.listing || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load order confirmation"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    verifyOrder();
    return () => {
      cancelled = true;
    };
  }, [sessionId, listingId, acct]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
        <h2 className="mt-4 text-lg font-bold text-[#050505]">
          Confirming your payment with Stripe...
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Recording your order in Supabase and marking the listing as Sold.
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-[#050505]">
          Unable to Load Order Receipt
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {error || "We could not find a completed order for this session."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {listingId && (
            <Button asChild variant="outline">
              <Link href={`/item/${encodeURIComponent(listingId)}`}>
                View Listing
              </Link>
            </Button>
          )}
          <Button asChild className="bg-[#1877F2] hover:bg-[#166FE5]">
            <Link href="/">Back to Marketplace</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Top Banner */}
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-500/15 via-emerald-50 to-white p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                  Payment Confirmed
                </Badge>
                <Badge className="bg-red-600 text-white hover:bg-red-700">
                  Listing Marked as SOLD
                </Badge>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#050505] sm:text-3xl">
                Thank you for your purchase!
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Your payment was processed via Stripe Connect and recorded in
                Supabase.
              </p>
            </div>
          </div>
        </div>

        <CardContent className="space-y-6 p-6 sm:p-8">
          {/* Purchased Item Summary */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-[#F0F2F5]/60 p-4 sm:flex-row sm:items-center">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-200">
              {listing && isSafeDisplayImageUrl(listing.image_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={listing.image_url!}
                  alt={order.listing_title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-red-600 py-0.5 text-center text-[10px] font-extrabold uppercase tracking-wider text-white">
                Sold
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-red-600 text-white">SOLD</Badge>
                <span className="text-xs text-gray-500">
                  Order #{order.id.slice(0, 8)}
                </span>
              </div>
              <h2 className="mt-1 truncate text-lg font-bold text-[#050505]">
                {order.listing_title || listing?.title}
              </h2>
              <p className="mt-0.5 text-xs text-gray-600">
                Seller:{" "}
                <strong className="font-semibold text-[#050505]">
                  {order.seller_email}
                </strong>
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs text-gray-500 block">Total Paid</span>
              <span className="text-2xl font-extrabold text-[#1877F2]">
                {formatPrice(order.amount_total)}
              </span>
            </div>
          </div>

          <Separator />

          {/* Stripe Connect Payout Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#635BFF]" />
              <h3 className="text-base font-bold text-[#050505]">
                Stripe Connect Payment & Payout Summary
              </h3>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Item Price Paid by Buyer</span>
                <span className="font-semibold text-[#050505]">
                  ${Number(order.amount_total).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">
                  Marketplace Platform Fee (10%)
                </span>
                <span className="font-medium text-gray-700">
                  -${Number(order.platform_fee).toFixed(2)}
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-base">
                <span className="font-bold text-emerald-800">
                  Net Payout to Seller ({order.seller_email})
                </span>
                <span className="font-extrabold text-emerald-700">
                  ${Number(order.seller_payout).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Metadata Details Grid */}
            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-gray-200 p-3">
                <span className="text-gray-500 block">
                  Seller Connected Account
                </span>
                <code className="mt-0.5 block font-mono font-semibold text-[#635BFF]">
                  {order.seller_stripe_account_id || "Connected Account"}
                </code>
              </div>

              <div className="rounded-xl border border-gray-200 p-3">
                <span className="text-gray-500 block">
                  Stripe Checkout Session
                </span>
                <code className="mt-0.5 block truncate font-mono text-gray-800">
                  {order.stripe_checkout_session_id}
                </code>
              </div>

              {order.buyer_email && (
                <div className="rounded-xl border border-gray-200 p-3">
                  <span className="text-gray-500 block">Buyer Email</span>
                  <span className="mt-0.5 block font-semibold text-[#050505]">
                    {order.buyer_email}
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-gray-200 p-3">
                <span className="text-gray-500 block">Database Status</span>
                <span className="mt-0.5 inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Order Saved in Supabase · Listing Sold
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              asChild
              className="h-11 flex-1 bg-[#1877F2] text-[15px] font-semibold text-white hover:bg-[#166FE5]"
            >
              <Link href={`/item/${order.listing_id}`}>
                <PackageCheck className="mr-2 h-4 w-4" />
                View Sold Listing
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-11 flex-1 text-[15px] font-semibold"
            >
              <Link href="/">
                <ShoppingBag className="mr-2 h-4 w-4" />
                Back to Marketplace
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-10 w-10 animate-spin text-[#1877F2]" />
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
