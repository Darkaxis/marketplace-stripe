import { Listing, Message, SAMPLE_LISTINGS } from "@/lib/supabase";

// Global in-memory store used only as a fallback when Supabase env vars are not set yet
const globalForStore = globalThis as unknown as {
  fallbackListings?: Listing[];
  fallbackMessages?: Message[];
};

if (!globalForStore.fallbackListings) {
  globalForStore.fallbackListings = [...SAMPLE_LISTINGS];
}

if (!globalForStore.fallbackMessages) {
  globalForStore.fallbackMessages = [
    {
      id: "22222222-2222-4222-8222-222222222201",
      listing_id: "11111111-1111-4111-8111-111111111101",
      buyer_email: "jamie.buyer@gmail.com",
      seller_email: "alex.chen@stanford.edu",
      message: "Hi! Is this MacBook Pro still available? Can I pick it up in Palo Alto today?",
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ];
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
};
