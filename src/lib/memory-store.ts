import {
  Listing,
  Message,
  OrderRecord,
  SellerAccount,
} from "@/lib/supabase";

// Global in-memory store used as a fallback when Supabase env vars are not set yet
// and as a fast runtime cache alongside Supabase persistence.
const globalForStore = globalThis as unknown as {
  fallbackListings?: Listing[];
  fallbackMessages?: Message[];
  fallbackSellers?: Record<string, SellerAccount>;
  fallbackOrders?: Record<string, OrderRecord>;
  fallbackSoldListingIds?: Set<string>;
};

if (!globalForStore.fallbackListings) {
  globalForStore.fallbackListings = [];
}

if (!globalForStore.fallbackMessages) {
  globalForStore.fallbackMessages = [];
}

if (!globalForStore.fallbackSellers) {
  globalForStore.fallbackSellers = {};
}

if (!globalForStore.fallbackOrders) {
  globalForStore.fallbackOrders = {};
}

if (!globalForStore.fallbackSoldListingIds) {
  globalForStore.fallbackSoldListingIds = new Set<string>();
}

export const memoryStore = {
  getListings: () => globalForStore.fallbackListings!,
  addListing: (listing: Listing) => {
    globalForStore.fallbackListings = [
      listing,
      ...(globalForStore.fallbackListings || []),
    ];
    return listing;
  },
  getListingById: (id: string) =>
    (globalForStore.fallbackListings || []).find((l) => l.id === id) || null,
  markListingSold: (id: string) => {
    globalForStore.fallbackSoldListingIds!.add(id);
    globalForStore.fallbackListings = (
      globalForStore.fallbackListings || []
    ).map((l) =>
      l.id === id
        ? {
            ...l,
            status: "sold",
            sold: true,
            updated_at: new Date().toISOString(),
          }
        : l
    );
  },
  isListingSold: (id: string) => globalForStore.fallbackSoldListingIds!.has(id),
  getMessagesByListing: (listingId: string) =>
    (globalForStore.fallbackMessages || []).filter(
      (m) => m.listing_id === listingId
    ),
  addMessage: (msg: Message) => {
    globalForStore.fallbackMessages = [
      ...(globalForStore.fallbackMessages || []),
      msg,
    ];
    return msg;
  },
  getSellerByEmail: (email: string) =>
    globalForStore.fallbackSellers![email.trim().toLowerCase()] || null,
  getSellerByAccountId: (accountId: string) =>
    Object.values(globalForStore.fallbackSellers!).find(
      (s) => s.stripe_account_id === accountId
    ) || null,
  getAllSellers: () => Object.values(globalForStore.fallbackSellers!),
  upsertSeller: (seller: SellerAccount) => {
    const key = seller.email.trim().toLowerCase();
    globalForStore.fallbackSellers![key] = {
      ...seller,
      email: key,
    };
    return globalForStore.fallbackSellers![key];
  },
  getOrderBySessionId: (sessionId: string) =>
    globalForStore.fallbackOrders![sessionId] || null,
  getOrderByListingId: (listingId: string) =>
    Object.values(globalForStore.fallbackOrders!).find(
      (o) => o.listing_id === listingId
    ) || null,
  getAllOrders: () => Object.values(globalForStore.fallbackOrders!),
  upsertOrder: (order: OrderRecord) => {
    globalForStore.fallbackOrders![order.stripe_checkout_session_id] = order;
    if (order.listing_id) {
      memoryStore.markListingSold(order.listing_id);
    }
    return order;
  },
};
