"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type Listing, type SellerAccount } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";

function ConnectWithStripeContent() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const initialAccountId = searchParams.get("account_id") || "";
  const onboardingParam = searchParams.get("onboarding") || "";
  const refreshParam = searchParams.get("refresh") || "";

  const [email, setEmail] = useState(initialEmail);
  const [seller, setSeller] = useState<SellerAccount | null>(null);
  const [sellerListings, setSellerListings] = useState<Listing[]>([]);
  const [suggestedEmails, setSuggestedEmails] = useState<string[]>([]);
  const [knownSellers, setKnownSellers] = useState<SellerAccount[]>([]);

  const [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect");
      if (res.ok) {
        const data = await res.json();
        setSuggestedEmails(data.suggestedEmails || []);
        setKnownSellers(data.sellers || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const checkSellerStatus = useCallback(
    async (targetEmail: string, accountId?: string) => {
      const clean = targetEmail.trim().toLowerCase();
      if (!clean) return;

      try {
        setCheckingStatus(true);
        setError(null);
        const params = new URLSearchParams({ email: clean });
        if (accountId) {
          params.set("account_id", accountId);
        }

        const res = await fetch(`/api/stripe/connect?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not check seller status");
        }

        setSeller(data.seller || null);
        setSellerListings(data.listings || []);
        await fetchOverview();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to verify seller onboarding status"
        );
      } finally {
        setCheckingStatus(false);
      }
    },
    [fetchOverview]
  );

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
      checkSellerStatus(initialEmail, initialAccountId);
      if (onboardingParam === "complete") {
        setStatusMessage(
          "Returned from Stripe onboarding! Verifying and saving your connected account in Supabase..."
        );
      } else if (refreshParam === "1") {
        setStatusMessage(
          "Your Stripe onboarding link expired or was refreshed. Click 'Connect with Stripe' below to continue."
        );
      }
    }
  }, [initialEmail, initialAccountId, onboardingParam, refreshParam, checkSellerStatus]);

  const handleConnectWithStripe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    const clean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!clean || !emailRegex.test(clean)) {
      setError("Please enter a valid seller email address.");
      return;
    }

    try {
      setConnecting(true);
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(
          data.error || "Failed to generate Stripe Connect onboarding link"
        );
      }

      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start Stripe Connect onboarding"
      );
      setConnecting(false);
    }
  };

  const isFullyOnboarded = Boolean(
    seller?.onboarding_complete && seller?.charges_enabled
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 transition-colors hover:text-[#1877F2]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </Link>
      </div>

      {/* Main Connect Card */}
      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-[#635BFF]/10 via-[#E7F3FF]/60 to-white p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#635BFF] text-white shadow-sm">
                <CreditCard className="h-7 w-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-[#635BFF] text-white hover:bg-[#5249e0]">
                    Stripe Connect
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-50 text-emerald-700"
                  >
                    90% Seller Payout · 10% Platform Fee
                  </Badge>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#050505] sm:text-3xl">
                  Connect with Stripe
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-gray-600">
                  Enter the email address on your listings and complete
                  Stripe&apos;s hosted onboarding. Once connected, every listing
                  with your email automatically displays a{" "}
                  <strong className="font-semibold text-[#050505]">
                    Buy Now
                  </strong>{" "}
                  button and routes payouts directly to your Stripe account.
                </p>
              </div>
            </div>
          </div>
        </div>

        <CardContent className="space-y-6 p-6 sm:p-8">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && !isFullyOnboarded && (
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#1877F2]" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Onboarding Form */}
          <form onSubmit={handleConnectWithStripe} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seller-email" className="text-sm font-bold">
                Seller Email Address
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="seller-email"
                    type="email"
                    required
                    placeholder="seller@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-10 text-base"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={connecting}
                  className="h-11 bg-[#635BFF] px-6 text-[15px] font-semibold text-white shadow-xs hover:bg-[#5249e0]"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redirecting to Stripe...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Connect with Stripe
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-80" />
                    </>
                  )}
                </Button>

                {email.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={checkingStatus}
                    onClick={() => checkSellerStatus(email)}
                    className="h-11"
                  >
                    {checkingStatus ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                    )}
                    Check Status
                  </Button>
                )}
              </div>
            </div>

            {/* Quick Select Existing Listing Sellers */}
            {suggestedEmails.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-gray-500">
                  Quick-select an existing seller email from Marketplace:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedEmails.slice(0, 8).map((suggested) => {
                    const existingRecord = knownSellers.find(
                      (s) => s.email.toLowerCase() === suggested.toLowerCase()
                    );
                    const isOnboarded = Boolean(
                      existingRecord?.onboarding_complete &&
                        existingRecord?.charges_enabled
                    );
                    return (
                      <button
                        key={suggested}
                        type="button"
                        onClick={() => {
                          setEmail(suggested);
                          checkSellerStatus(suggested);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          email.trim().toLowerCase() === suggested.toLowerCase()
                            ? "border-[#635BFF] bg-[#635BFF]/10 text-[#635BFF]"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#635BFF] hover:bg-white"
                        }`}
                      >
                        <span>{suggested}</span>
                        {isOnboarded && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </form>

          {/* Connected Seller Status Card */}
          {seller && (
            <>
              <Separator />
              <div
                className={`rounded-2xl border p-5 ${
                  isFullyOnboarded
                    ? "border-emerald-200 bg-emerald-50/60"
                    : "border-amber-200 bg-amber-50/60"
                }`}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3">
                    {isFullyOnboarded ? (
                      <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-[#050505]">
                          {isFullyOnboarded
                            ? "Stripe Connect Onboarding Complete!"
                            : "Stripe Account Created — Finish Onboarding"}
                        </h2>
                        <Badge
                          className={
                            isFullyOnboarded
                              ? "bg-emerald-600 text-white"
                              : "bg-amber-600 text-white"
                          }
                        >
                          {isFullyOnboarded
                            ? "Buy Now Enabled"
                            : "Onboarding Pending"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-700">
                        Seller Email:{" "}
                        <strong className="font-semibold">{seller.email}</strong>{" "}
                        · Connected Account ID saved in Supabase:{" "}
                        <code className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#635BFF]">
                          {seller.stripe_account_id}
                        </code>
                      </p>
                    </div>
                  </div>

                  {!isFullyOnboarded && (
                    <Button
                      type="button"
                      onClick={handleConnectWithStripe}
                      disabled={connecting}
                      size="sm"
                      className="bg-[#635BFF] text-white hover:bg-[#5249e0]"
                    >
                      Resume Onboarding
                    </Button>
                  )}
                </div>

                {/* Matching Listings for this Seller */}
                <div className="mt-4 border-t border-black/10 pt-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Listings for {seller.email} ({sellerListings.length})
                    </h3>
                    <Link
                      href="/create/item"
                      className="text-xs font-semibold text-[#1877F2] hover:underline"
                    >
                      + Create New Listing
                    </Link>
                  </div>

                  {sellerListings.length === 0 ? (
                    <p className="text-xs text-gray-600">
                      No listings found with{" "}
                      <strong className="font-semibold">{seller.email}</strong>{" "}
                      yet.{" "}
                      <Link
                        href="/create/item"
                        className="font-semibold text-[#1877F2] underline"
                      >
                        Create a listing
                      </Link>{" "}
                      using this email to see the Buy Now button!
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {sellerListings.map((item) => (
                        <Link
                          key={item.id}
                          href={`/item/${item.id}`}
                          className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 transition-shadow hover:shadow-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <p className="truncate text-sm font-semibold text-[#050505]">
                              {item.title}
                            </p>
                            <p className="text-xs font-bold text-[#1877F2]">
                              {formatPrice(item.price)}
                            </p>
                          </div>
                          {item.sold || item.status === "sold" ? (
                            <Badge className="shrink-0 bg-red-600 text-white">
                              Sold
                            </Badge>
                          ) : item.seller_onboarded ? (
                            <Badge className="shrink-0 bg-emerald-600 text-white">
                              <ShoppingBag className="mr-1 h-3 w-3" />
                              Buy Now Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="shrink-0">
                              Not Purchasable
                            </Badge>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Sandbox Test Helper Guide */}
          <div className="rounded-xl border border-gray-200 bg-[#F0F2F5]/70 p-4 text-xs text-gray-700">
            <div className="mb-2 flex items-center gap-1.5 font-bold text-[#050505]">
              <Sparkles className="h-4 w-4 text-[#635BFF]" />
              <span>Stripe Sandbox Quick Test Values</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-2.5 border border-gray-200/80">
                <span className="text-gray-500 block">Phone & SMS Code</span>
                <strong className="font-mono text-[#050505]">
                  000-000-0000 / 000000
                </strong>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-gray-200/80">
                <span className="text-gray-500 block">DOB & SSN Last 4</span>
                <strong className="font-mono text-[#050505]">
                  01/01/1990 · SSN 0000
                </strong>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-gray-200/80">
                <span className="text-gray-500 block">Payout Account</span>
                <strong className="text-[#050505]">
                  Click &ldquo;Use test account&rdquo;
                </strong>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConnectWithStripePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#635BFF]" />
        </div>
      }
    >
      <ConnectWithStripeContent />
    </Suspense>
  );
}
