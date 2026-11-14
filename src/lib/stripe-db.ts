import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseConfigured,
  type Listing,
  type OrderRecord,
  type SellerAccount,
} from "@/lib/supabase";
import { getServerSupabaseClient } from "@/lib/supabase-admin";
import { memoryStore } from "@/lib/memory-store";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

const STATE_BUCKET = "stripe-connect-state";
const SELLERS_FOLDER = "_stripe_sellers";
const ORDERS_FOLDER = "_stripe_orders";
const PENDING_SESSIONS_FOLDER = "_stripe_pending";

let privateBucketReady = false;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Ensures the private `stripe-connect-state` bucket exists (server-only via service role).
 */
async function ensurePrivateStateBucket(db: SupabaseClient): Promise<void> {
  if (privateBucketReady) return;
  try {
    const { data, error } = await db.storage.getBucket(STATE_BUCKET);
    if (!error && data) {
      privateBucketReady = true;
      return;
    }

    const { error: createError } = await db.storage.createBucket(STATE_BUCKET, {
      public: false,
    });
    if (
      !createError ||
      createError.message?.toLowerCase().includes("already exists")
    ) {
      privateBucketReady = true;
    }
  } catch {
    // Ignore and retry on next request
  }
}

function encodeSellerFilename(seller: SellerAccount): string {
  const hexEmail = Buffer.from(normalizeEmail(seller.email), "utf8").toString(
    "hex"
  );
  const onboardedFlag = seller.onboarding_complete ? "1" : "0";
  const chargesFlag = seller.charges_enabled ? "1" : "0";
  return `${hexEmail}__${seller.stripe_account_id}__${onboardedFlag}__${chargesFlag}.json`;
}

function decodeSellerFilename(name: string): SellerAccount | null {
  if (!name.endsWith(".json")) return null;
  const base = name.slice(0, -5);
  const parts = base.split("__");
  if (parts.length < 4) return null;
  const [hexEmail, stripeAccountId, onboardedFlag, chargesFlag] = parts;
  if (!/^[0-9a-f]+$/i.test(hexEmail) || hexEmail.length % 2 !== 0) {
    return null;
  }
  try {
    const email = Buffer.from(hexEmail, "hex").toString("utf8");
    if (!email || !stripeAccountId.startsWith("acct_")) return null;
    const onboardingComplete = onboardedFlag === "1";
    const chargesEnabled = chargesFlag === "1";
    return {
      email: normalizeEmail(email),
      stripe_account_id: stripeAccountId,
      onboarding_complete: onboardingComplete,
      charges_enabled: chargesEnabled,
      payouts_enabled: chargesEnabled,
      details_submitted: onboardingComplete,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function encodeOrderFilename(order: OrderRecord): string {
  const totalCents = Math.round(Number(order.amount_total) * 100);
  const feeCents = Math.round(Number(order.platform_fee) * 100);
  return `${order.listing_id}__${order.stripe_checkout_session_id}__${totalCents}__${feeCents}.json`;
}

function decodeOrderSummaryFromFilename(
  name: string,
  createdAt?: string | null
): Partial<OrderRecord> | null {
  if (!name.endsWith(".json")) return null;
  const base = name.slice(0, -5);
  const parts = base.split("__");
  if (parts.length < 4) return null;
  const [listingId, sessionId, totalCentsStr, feeCentsStr] = parts;
  const totalCents = Number(totalCentsStr);
  const feeCents = Number(feeCentsStr);
  if (!listingId || !sessionId || !Number.isFinite(totalCents)) return null;
  const amountTotal = totalCents / 100;
  const platformFee = Number.isFinite(feeCents) ? feeCents / 100 : 0;
  const sellerPayout = Math.round((amountTotal - platformFee) * 100) / 100;
  return {
    id: sessionId,
    listing_id: listingId,
    stripe_checkout_session_id: sessionId,
    amount_total: amountTotal,
    platform_fee: platformFee,
    seller_payout: sellerPayout,
    currency: "usd",
    status: "paid",
    created_at: createdAt || new Date().toISOString(),
  };
}

/**
 * Saves or updates a seller's Stripe Connect account in Supabase.
 * Writes to both the `sellers` / `listings` tables (when SQL migration is applied)
 * and the private `stripe-connect-state` bucket so persistence works out of the box.
 */
export async function saveSellerAccount(
  input: Omit<SellerAccount, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string;
  }
): Promise<SellerAccount> {
  const now = new Date().toISOString();
  const cleanEmail = normalizeEmail(input.email);
  const record: SellerAccount = {
    email: cleanEmail,
    stripe_account_id: input.stripe_account_id.trim(),
    onboarding_complete: Boolean(input.onboarding_complete),
    charges_enabled: Boolean(input.charges_enabled),
    payouts_enabled: Boolean(input.payouts_enabled),
    details_submitted: Boolean(input.details_submitted),
    created_at: input.created_at || now,
    updated_at: input.updated_at || now,
  };

  if (!isSupabaseConfigured()) {
    return memoryStore.upsertSeller(record);
  }

  const db = getServerSupabaseClient();
  await ensurePrivateStateBucket(db);

  // 1. Try native `sellers` table in Supabase Postgres
  try {
    await db.from("sellers").upsert(
      {
        email: record.email,
        stripe_account_id: record.stripe_account_id,
        onboarding_complete: record.onboarding_complete,
        charges_enabled: record.charges_enabled,
        payouts_enabled: record.payouts_enabled,
        details_submitted: record.details_submitted,
        updated_at: record.updated_at,
      },
      { onConflict: "email" }
    );
  } catch {
    // Ignore if table not created yet
  }

  // 2. Try updating `seller_stripe_account_id` on `listings` table if column exists
  try {
    await db
      .from("listings")
      .update({ seller_stripe_account_id: record.stripe_account_id })
      .ilike("seller_email", record.email);
  } catch {
    // Ignore if column not created yet
  }

  // 3. Persist in private `stripe-connect-state` storage bucket
  try {
    const hexPrefix = Buffer.from(cleanEmail, "utf8").toString("hex") + "__";
    const { data: existingFiles } = await db.storage
      .from(STATE_BUCKET)
      .list(SELLERS_FOLDER, { limit: 100, search: hexPrefix });

    const newFilename = encodeSellerFilename(record);
    const toRemove = (existingFiles || [])
      .filter((f) => f.name.startsWith(hexPrefix) && f.name !== newFilename)
      .map((f) => `${SELLERS_FOLDER}/${f.name}`);

    await db.storage
      .from(STATE_BUCKET)
      .upload(
        `${SELLERS_FOLDER}/${newFilename}`,
        Buffer.from(JSON.stringify(record), "utf8"),
        {
          contentType: "application/json",
          upsert: true,
        }
      );

    if (toRemove.length > 0) {
      await db.storage.from(STATE_BUCKET).remove(toRemove);
    }
  } catch (err) {
    console.error("Supabase storage seller sync warning:", err);
  }

  return record;
}

/**
 * Syncs a seller's Stripe account status directly from the Stripe API,
 * updating Supabase when `details_submitted` or `charges_enabled` changes.
 */
export async function syncSellerWithStripe(
  seller: SellerAccount
): Promise<SellerAccount> {
  if (!isStripeConfigured() || !seller.stripe_account_id) {
    return seller;
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(seller.stripe_account_id);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const detailsSubmitted = Boolean(account.details_submitted);
    const onboardingComplete = Boolean(chargesEnabled && detailsSubmitted);

    if (
      onboardingComplete !== seller.onboarding_complete ||
      chargesEnabled !== seller.charges_enabled ||
      payoutsEnabled !== seller.payouts_enabled ||
      detailsSubmitted !== seller.details_submitted
    ) {
      return await saveSellerAccount({
        email: seller.email,
        stripe_account_id: seller.stripe_account_id,
        onboarding_complete: onboardingComplete,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
      });
    }

    return seller;
  } catch (err) {
    console.error("Failed to sync seller account from Stripe:", err);
    return seller;
  }
}

/**
 * Loads all seller records from Supabase (`sellers` table + private storage bucket).
 */
export async function getAllSellersMap(): Promise<Map<string, SellerAccount>> {
  const map = new Map<string, SellerAccount>();

  if (!isSupabaseConfigured()) {
    for (const s of memoryStore.getAllSellers()) {
      map.set(normalizeEmail(s.email), s);
    }
    return map;
  }

  const db = getServerSupabaseClient();
  await ensurePrivateStateBucket(db);

  // 1. Read from private storage bucket (`_stripe_sellers`)
  try {
    const { data: files } = await db.storage
      .from(STATE_BUCKET)
      .list(SELLERS_FOLDER, { limit: 1000 });

    for (const file of files || []) {
      const parsed = decodeSellerFilename(file.name);
      if (parsed) {
        const existing = map.get(parsed.email);
        if (
          !existing ||
          (parsed.onboarding_complete && !existing.onboarding_complete)
        ) {
          map.set(parsed.email, parsed);
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Read from `sellers` table if it exists in Supabase Postgres
  try {
    const { data, error } = await db.from("sellers").select("*").limit(1000);
    if (!error && data) {
      for (const row of data) {
        if (row.email && row.stripe_account_id) {
          const email = normalizeEmail(row.email);
          const existing = map.get(email);
          const seller: SellerAccount = {
            email,
            stripe_account_id: row.stripe_account_id,
            onboarding_complete:
              Boolean(row.onboarding_complete) ||
              Boolean(existing?.onboarding_complete),
            charges_enabled:
              Boolean(row.charges_enabled) ||
              Boolean(existing?.charges_enabled),
            payouts_enabled:
              Boolean(row.payouts_enabled) ||
              Boolean(existing?.payouts_enabled),
            details_submitted:
              Boolean(row.details_submitted) ||
              Boolean(existing?.details_submitted),
            created_at: row.created_at || new Date().toISOString(),
            updated_at: row.updated_at || new Date().toISOString(),
          };
          map.set(email, seller);
        }
      }
    }
  } catch {
    // ignore if table does not exist yet
  }

  return map;
}

export async function getSellerByEmail(
  email: string,
  options?: { refreshFromStripe?: boolean }
): Promise<SellerAccount | null> {
  const cleanEmail = normalizeEmail(email);
  const sellersMap = await getAllSellersMap();
  const seller = sellersMap.get(cleanEmail) || null;

  if (!seller) {
    return null;
  }

  if (options?.refreshFromStripe || !seller.onboarding_complete) {
    return await syncSellerWithStripe(seller);
  }

  return seller;
}

export async function getSellerByStripeAccountId(
  stripeAccountId: string
): Promise<SellerAccount | null> {
  const cleanId = stripeAccountId.trim();
  const sellersMap = await getAllSellersMap();
  for (const seller of sellersMap.values()) {
    if (seller.stripe_account_id === cleanId) {
      return seller;
    }
  }
  return null;
}

/**
 * Records a pending Stripe Checkout session for a listing so it can be reconciled if needed.
 */
export async function recordPendingCheckoutSession(params: {
  listing_id: string;
  session_id: string;
  seller_stripe_account_id: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const db = getServerSupabaseClient();
    await ensurePrivateStateBucket(db);
    const filename = `${params.listing_id}__${params.session_id}__${params.seller_stripe_account_id}.json`;
    await db.storage
      .from(STATE_BUCKET)
      .upload(
        `${PENDING_SESSIONS_FOLDER}/${filename}`,
        Buffer.from(JSON.stringify(params), "utf8"),
        { contentType: "application/json", upsert: true }
      );
  } catch {
    // ignore
  }
}

/**
 * Idempotently records a completed order in Supabase and marks the listing as Sold.
 */
export async function recordCompletedOrder(
  input: Omit<OrderRecord, "id" | "created_at" | "status"> & {
    id?: string;
    created_at?: string;
    status?: "paid" | "completed";
  }
): Promise<OrderRecord> {
  const now = new Date().toISOString();
  const order: OrderRecord = {
    id: input.id || crypto.randomUUID(),
    listing_id: input.listing_id,
    listing_title: input.listing_title,
    seller_email: normalizeEmail(input.seller_email),
    seller_stripe_account_id: input.seller_stripe_account_id,
    buyer_email: input.buyer_email ? normalizeEmail(input.buyer_email) : null,
    amount_total: Math.round(Number(input.amount_total) * 100) / 100,
    platform_fee: Math.round(Number(input.platform_fee) * 100) / 100,
    seller_payout: Math.round(Number(input.seller_payout) * 100) / 100,
    currency: (input.currency || "usd").toLowerCase(),
    stripe_checkout_session_id: input.stripe_checkout_session_id,
    stripe_payment_intent_id: input.stripe_payment_intent_id || null,
    status: input.status || "paid",
    created_at: input.created_at || now,
  };

  if (!isSupabaseConfigured()) {
    return memoryStore.upsertOrder(order);
  }

  const db = getServerSupabaseClient();
  await ensurePrivateStateBucket(db);

  // 1. Try inserting/upserting into `orders` table in Supabase Postgres
  try {
    const { data, error } = await db
      .from("orders")
      .upsert(
        {
          listing_id: order.listing_id,
          listing_title: order.listing_title,
          seller_email: order.seller_email,
          seller_stripe_account_id: order.seller_stripe_account_id,
          buyer_email: order.buyer_email,
          amount_total: order.amount_total,
          platform_fee: order.platform_fee,
          seller_payout: order.seller_payout,
          currency: order.currency,
          stripe_checkout_session_id: order.stripe_checkout_session_id,
          stripe_payment_intent_id: order.stripe_payment_intent_id,
          status: order.status,
        },
        { onConflict: "stripe_checkout_session_id" }
      )
      .select()
      .single();

    if (!error && data) {
      order.id = data.id || order.id;
    }
  } catch {
    // Ignore if `orders` table not created yet
  }

  // 2. Try marking `listings` row as Sold (`status = 'sold'`, `sold = true`) in Supabase Postgres
  try {
    await db
      .from("listings")
      .update({
        status: "sold",
        sold: true,
      })
      .eq("id", order.listing_id);
  } catch {
    // Ignore if `status` / `sold` columns are not added yet
  }

  // 3. Persist full order in private `stripe-connect-state` bucket
  try {
    const filename = encodeOrderFilename(order);
    await db.storage
      .from(STATE_BUCKET)
      .upload(
        `${ORDERS_FOLDER}/${filename}`,
        Buffer.from(JSON.stringify(order), "utf8"),
        {
          contentType: "application/json",
          upsert: true,
        }
      );
  } catch (err) {
    console.error("Supabase storage order sync warning:", err);
  }

  return order;
}

/**
 * Returns a map of `listing_id -> OrderRecord` for all sold listings in Supabase.
 */
export async function getSoldOrdersByListingMap(): Promise<
  Map<string, OrderRecord>
> {
  const soldMap = new Map<string, OrderRecord>();

  if (!isSupabaseConfigured()) {
    for (const o of memoryStore.getAllOrders()) {
      if (o.listing_id) {
        soldMap.set(o.listing_id, o);
      }
    }
    return soldMap;
  }

  const db = getServerSupabaseClient();
  await ensurePrivateStateBucket(db);

  // 1. Read from private storage bucket (`_stripe_orders`)
  try {
    const { data: files } = await db.storage
      .from(STATE_BUCKET)
      .list(ORDERS_FOLDER, { limit: 1000 });

    for (const file of files || []) {
      const summary = decodeOrderSummaryFromFilename(
        file.name,
        file.created_at
      );
      if (summary && summary.listing_id) {
        const order: OrderRecord = {
          id: summary.id || summary.stripe_checkout_session_id!,
          listing_id: summary.listing_id,
          listing_title: "",
          seller_email: "",
          seller_stripe_account_id: "",
          buyer_email: null,
          amount_total: summary.amount_total || 0,
          platform_fee: summary.platform_fee || 0,
          seller_payout: summary.seller_payout || 0,
          currency: "usd",
          stripe_checkout_session_id: summary.stripe_checkout_session_id!,
          stripe_payment_intent_id: null,
          status: "paid",
          created_at: summary.created_at || new Date().toISOString(),
        };
        soldMap.set(order.listing_id, order);
      }
    }
  } catch {
    // ignore
  }

  // 2. Read from `orders` table if it exists in Supabase Postgres
  try {
    const { data, error } = await db.from("orders").select("*").limit(1000);
    if (!error && data) {
      for (const row of data) {
        if (row.listing_id) {
          const order: OrderRecord = {
            id: row.id,
            listing_id: row.listing_id,
            listing_title: row.listing_title || "",
            seller_email: row.seller_email || "",
            seller_stripe_account_id: row.seller_stripe_account_id || "",
            buyer_email: row.buyer_email || null,
            amount_total: Number(row.amount_total) || 0,
            platform_fee: Number(row.platform_fee) || 0,
            seller_payout: Number(row.seller_payout) || 0,
            currency: row.currency || "usd",
            stripe_checkout_session_id: row.stripe_checkout_session_id,
            stripe_payment_intent_id: row.stripe_payment_intent_id || null,
            status: "paid",
            created_at: row.created_at || new Date().toISOString(),
          };
          soldMap.set(order.listing_id, order);
        }
      }
    }
  } catch {
    // ignore if table does not exist yet
  }

  return soldMap;
}

/**
 * Retrieves an order by its Stripe Checkout Session ID from Supabase.
 */
export async function getOrderBySessionId(
  sessionId: string
): Promise<OrderRecord | null> {
  const cleanSessionId = sessionId.trim();

  if (!isSupabaseConfigured()) {
    return memoryStore.getOrderBySessionId(cleanSessionId);
  }

  const db = getServerSupabaseClient();
  await ensurePrivateStateBucket(db);

  // 1. Check `orders` table in Postgres
  try {
    const { data, error } = await db
      .from("orders")
      .select("*")
      .eq("stripe_checkout_session_id", cleanSessionId)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        listing_id: data.listing_id,
        listing_title: data.listing_title || "",
        seller_email: data.seller_email || "",
        seller_stripe_account_id: data.seller_stripe_account_id || "",
        buyer_email: data.buyer_email || null,
        amount_total: Number(data.amount_total) || 0,
        platform_fee: Number(data.platform_fee) || 0,
        seller_payout: Number(data.seller_payout) || 0,
        currency: data.currency || "usd",
        stripe_checkout_session_id: data.stripe_checkout_session_id,
        stripe_payment_intent_id: data.stripe_payment_intent_id || null,
        status: "paid",
        created_at: data.created_at || new Date().toISOString(),
      };
    }
  } catch {
    // ignore
  }

  // 2. Check `_stripe_orders` in private Supabase Storage
  try {
    const { data: files } = await db.storage
      .from(STATE_BUCKET)
      .list(ORDERS_FOLDER, { limit: 1000 });

    const matchingFile = (files || []).find((f) =>
      f.name.includes(`__${cleanSessionId}__`)
    );

    if (matchingFile) {
      const { data: blob } = await db.storage
        .from(STATE_BUCKET)
        .download(`${ORDERS_FOLDER}/${matchingFile.name}`);
      if (blob) {
        const text = await blob.text();
        return JSON.parse(text) as OrderRecord;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Reconciles any pending checkout session for a specific listing against Stripe,
 * ensuring that if a payment succeeded on Stripe, the listing is marked Sold even before redirect/webhook.
 */
export async function reconcilePendingCheckoutForListing(
  listing: Listing
): Promise<OrderRecord | null> {
  if (!isSupabaseConfigured() || !isStripeConfigured()) return null;

  try {
    const db = getServerSupabaseClient();
    await ensurePrivateStateBucket(db);
    const prefix = `${listing.id}__`;
    const { data: pendingFiles } = await db.storage
      .from(STATE_BUCKET)
      .list(PENDING_SESSIONS_FOLDER, { limit: 20, search: prefix });

    if (!pendingFiles || pendingFiles.length === 0) return null;

    const stripe = getStripe();
    const expectedMinCents = Math.round(Number(listing.price) * 100);

    for (const file of pendingFiles) {
      if (!file.name.startsWith(prefix) || !file.name.endsWith(".json"))
        continue;
      const parts = file.name.slice(0, -5).split("__");
      if (parts.length < 3) continue;
      const [, sessionId, stripeAccountId] = parts;
      if (!sessionId || !stripeAccountId) continue;

      // Only accept pending sessions for this listing's actual onboarded seller
      if (
        listing.seller_stripe_account_id &&
        stripeAccountId !== listing.seller_stripe_account_id
      ) {
        continue;
      }

      try {
        const session = await stripe.checkout.sessions.retrieve(
          sessionId,
          {},
          { stripeAccount: stripeAccountId }
        );

        if (
          session.payment_status === "paid" &&
          session.metadata?.listing_id === listing.id &&
          (session.amount_total ?? 0) >= expectedMinCents
        ) {
          const amountTotal = (session.amount_total ?? 0) / 100;
          const platformFee = session.metadata?.platform_fee_cents
            ? Number(session.metadata.platform_fee_cents) / 100
            : Math.round(amountTotal * 10) / 100;
          const sellerPayout =
            Math.round((amountTotal - platformFee) * 100) / 100;

          const order = await recordCompletedOrder({
            listing_id: listing.id,
            listing_title: listing.title,
            seller_email: listing.seller_email,
            seller_stripe_account_id: stripeAccountId,
            buyer_email: session.customer_details?.email || null,
            amount_total: amountTotal,
            platform_fee: platformFee,
            seller_payout: sellerPayout,
            currency: session.currency || "usd",
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || null,
          });

          await db.storage
            .from(STATE_BUCKET)
            .remove([`${PENDING_SESSIONS_FOLDER}/${file.name}`]);

          return order;
        }

        if (session.status === "expired") {
          await db.storage
            .from(STATE_BUCKET)
            .remove([`${PENDING_SESSIONS_FOLDER}/${file.name}`]);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Enriches a list of listings with `status` ("available" | "sold"), `sold`,
 * `seller_onboarded`, and `seller_stripe_account_id` from Supabase.
 */
export async function enrichListingsWithStripeState<
  T extends Partial<Listing> & { id: string; seller_email?: string }
>(
  listings: T[],
  options?: { syncUnfinishedSellersWithStripe?: boolean }
): Promise<T[]> {
  if (listings.length === 0) return listings;

  const [sellersMap, soldMap] = await Promise.all([
    getAllSellersMap(),
    getSoldOrdersByListingMap(),
  ]);

  if (options?.syncUnfinishedSellersWithStripe) {
    const uniqueEmails = new Set<string>();
    for (const item of listings) {
      if (item.seller_email) {
        uniqueEmails.add(normalizeEmail(item.seller_email));
      }
    }

    for (const email of uniqueEmails) {
      const seller = sellersMap.get(email);
      if (seller && !seller.onboarding_complete) {
        const synced = await syncSellerWithStripe(seller);
        sellersMap.set(email, synced);
      }
    }
  }

  return listings.map((item) => {
    const email = item.seller_email ? normalizeEmail(item.seller_email) : "";
    const seller = email ? sellersMap.get(email) : undefined;
    const isSold =
      Boolean(item.sold) ||
      item.status === "sold" ||
      soldMap.has(item.id) ||
      (!isSupabaseConfigured() && memoryStore.isListingSold(item.id));

    const sellerOnboarded = Boolean(
      seller?.onboarding_complete &&
        seller?.charges_enabled &&
        seller?.stripe_account_id
    );

    return {
      ...item,
      status: isSold ? "sold" : "available",
      sold: isSold,
      seller_onboarded: sellerOnboarded,
      seller_stripe_account_id: sellerOnboarded
        ? seller!.stripe_account_id
        : null,
    };
  });
}
