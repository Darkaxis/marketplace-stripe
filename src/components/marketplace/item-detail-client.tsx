"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Mail,
  Send,
  Share2,
  Bookmark,
  Check,
  Clock,
  Tag,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { type Listing } from "@/lib/supabase";
import { getCategoryLabel } from "@/lib/categories";
import { formatPrice, formatRelativeTime } from "@/lib/utils";
import { isSafeDisplayImageUrl } from "@/lib/validation";

interface InquiryItem {
  id: string;
  listing_id: string;
  buyer_label: string;
  created_at: string;
  own_message?: string;
}

const QUICK_MESSAGES = [
  "Hi, is this still available?",
  "When are you available for pickup?",
  "Is the price negotiable?",
];

export function ItemDetailClient({ id }: { id: string }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [messages, setMessages] = useState<InquiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // Messaging form state
  const [buyerEmail, setBuyerEmail] = useState("");
  const [messageText, setMessageText] = useState(
    "Hi, is this still available?"
  );
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [emailNotified, setEmailNotified] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Action buttons state
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchItemAndMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [itemRes, msgRes] = await Promise.all([
        fetch(`/api/listings/${id}`),
        fetch(`/api/messages?listing_id=${encodeURIComponent(id)}`),
      ]);

      if (!itemRes.ok) {
        if (itemRes.status === 404) {
          throw new Error("This listing could not be found or has been removed.");
        }
        throw new Error("Failed to load listing details.");
      }

      const itemData = await itemRes.json();
      setListing(itemData.listing);

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load listing details"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItemAndMessages();
  }, [fetchItemAndMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing) return;

    setMessageError(null);
    setMessageSuccess(false);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!buyerEmail.trim() || !emailRegex.test(buyerEmail.trim())) {
      setMessageError("Please enter a valid email address so the seller can reply.");
      return;
    }

    if (!messageText.trim()) {
      setMessageError("Please enter a message for the seller.");
      return;
    }

    try {
      setSendingMessage(true);
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_email: buyerEmail.trim(),
          message: messageText.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      setMessages((prev) => [...prev, data.message]);
      setMessageSuccess(true);
      setEmailNotified(Boolean(data.emailSent));
      setMessageText("");
    } catch (err) {
      setMessageError(
        err instanceof Error ? err.message : "Could not send message"
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#1877F2]" />
          <p className="text-sm font-medium text-gray-500">
            Loading listing details...
          </p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-[#050505]">
          Listing Not Available
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-gray-500">
          {error || "The item you are looking for does not exist."}
        </p>
        <Button asChild className="mt-6 bg-[#1877F2] hover:bg-[#166FE5]">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Marketplace
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Left Column: Full-bleed Image Viewer */}
      <div className="relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden bg-neutral-950 p-4 sm:min-h-[480px] lg:h-[calc(100vh-3.5rem)] lg:sticky lg:top-14">
        {/* Back Button Overlay */}
        <Link
          href="/"
          className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-black"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Marketplace</span>
        </Link>

        {isSafeDisplayImageUrl(listing.image_url) && !imgError ? (
          <>
            {/* Ambient blurred background */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.image_url!}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
            />
            {/* Main crisp image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.image_url!}
              alt={listing.title}
              onError={() => setImgError(true)}
              className="relative z-10 max-h-[82vh] w-full max-w-4xl rounded-lg object-contain shadow-2xl"
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-neutral-400">
            <ImageIcon className="mb-3 h-20 w-20 stroke-[1.2]" />
            <p className="text-base font-medium">No image available</p>
          </div>
        )}
      </div>

      {/* Right Column: Item Details, Seller Info & Messaging */}
      <aside className="w-full shrink-0 border-l border-gray-200 bg-white p-5 sm:p-6 lg:w-[420px] xl:w-[460px] lg:overflow-y-auto">
        <div className="space-y-6">
          {/* Primary Header Info */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link href={`/category/${listing.category}`}>
                <Badge
                  variant="secondary"
                  className="bg-[#E7F3FF] text-[#1877F2] hover:bg-[#DBE7F2]"
                >
                  <Tag className="mr-1 h-3 w-3" />
                  {getCategoryLabel(listing.category)}
                </Badge>
              </Link>
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5" />
                Listed {formatRelativeTime(listing.created_at)}
              </span>
            </div>

            <h1 className="text-2xl font-bold leading-snug text-[#050505]">
              {listing.title}
            </h1>

            <div className="mt-1.5 text-2xl font-extrabold text-[#1877F2]">
              {formatPrice(listing.price)}
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
              <MapPin className="h-4 w-4 shrink-0 text-[#1877F2]" />
              <span>Listed in {listing.location || "Palo Alto, CA"}</span>
            </div>

            {/* Action Buttons Row */}
            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSaved(!saved)}
                className="flex-1 font-semibold"
              >
                <Bookmark
                  className={`mr-1.5 h-4 w-4 ${
                    saved ? "fill-[#1877F2] text-[#1877F2]" : ""
                  }`}
                />
                {saved ? "Saved" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleShare}
                className="flex-1 font-semibold"
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4 text-emerald-600" />
                    Copied Link
                  </>
                ) : (
                  <>
                    <Share2 className="mr-1.5 h-4 w-4" />
                    Share
                  </>
                )}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Item Details & Description */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-[#050505]">Details</h2>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#F0F2F5]/70 p-3 text-xs">
              <div>
                <span className="text-gray-500">Category</span>
                <p className="font-semibold text-[#050505]">
                  {getCategoryLabel(listing.category)}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Location</span>
                <p className="font-semibold text-[#050505]">
                  {listing.location || "Palo Alto, CA"}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-semibold text-[#050505]">
                Description
              </h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                {listing.description ||
                  "No additional description provided by the seller."}
              </p>
            </div>
          </div>

          <Separator />

          {/* Seller Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#050505]">
                Seller Information
              </h2>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified Email
              </span>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3.5">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-[#1877F2] text-base font-bold text-white">
                  {(listing.seller_email[0] || "S").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#050505]">
                  {listing.seller_email}
                </p>
                <p className="text-xs text-gray-500">
                  Active seller in {listing.location || "Palo Alto, CA"}
                </p>
              </div>
              <a
                href={`mailto:${listing.seller_email}?subject=${encodeURIComponent(
                  `Marketplace Inquiry: ${listing.title}`
                )}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E7F3FF] text-[#1877F2] transition-colors hover:bg-[#DBE7F2]"
                title="Email seller directly"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          <Separator />

          {/* Message Seller Form */}
          <Card className="border border-gray-200 bg-[#F0F2F5]/50 shadow-none">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#1877F2]" />
                <h2 className="text-base font-bold text-[#050505]">
                  Send seller a message
                </h2>
              </div>

              {/* Quick preset pills */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {QUICK_MESSAGES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMessageText(preset)}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-[#1877F2] hover:text-[#1877F2]"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {messageError && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{messageError}</span>
                </div>
              )}

              {messageSuccess && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Message saved for{" "}
                    <strong className="font-semibold">
                      {listing.seller_email}
                    </strong>
                    {emailNotified
                      ? " and an instant email notification has been sent!"
                      : "!"}
                  </span>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="buyer_email" className="text-xs font-semibold">
                    Your Email Address
                  </Label>
                  <Input
                    id="buyer_email"
                    type="email"
                    maxLength={255}
                    placeholder="your.email@example.com"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    className="bg-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="message" className="text-xs font-semibold">
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    rows={3}
                    maxLength={2000}
                    placeholder="Write your message to the seller..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="bg-white"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={sendingMessage}
                  className="w-full bg-[#1877F2] font-semibold text-white hover:bg-[#166FE5]"
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Anonymized Inquiries Activity for this Listing */}
          {messages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#050505]">
                  Recent Inquiries ({messages.length})
                </h3>
              </div>
              <div className="space-y-2.5">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-[#1877F2]">
                        {msg.buyer_label}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {formatRelativeTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-relaxed">
                      {msg.own_message || "Sent an inquiry to the seller."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
