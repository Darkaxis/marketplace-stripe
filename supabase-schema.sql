-- ============================================================================
-- Marketplace + Stripe Connect Schema (Idempotent — safe on fresh or Test 3 DB)
-- ============================================================================

-- 1. Listings table
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  seller_email VARCHAR(255) NOT NULL,
  image_url TEXT,
  location VARCHAR(255) DEFAULT 'Palo Alto, CA',
  status VARCHAR(50) DEFAULT 'available',
  sold BOOLEAN DEFAULT FALSE,
  seller_stripe_account_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add Stripe Connect & Sold columns to existing Test 3 listings table if upgrading
ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sold BOOLEAN DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_stripe_account_id VARCHAR(255);

-- 2. Sellers table (Stripe Connect Onboarding — server-managed via service_role)
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  stripe_account_id VARCHAR(255) NOT NULL,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  charges_enabled BOOLEAN DEFAULT FALSE,
  payouts_enabled BOOLEAN DEFAULT FALSE,
  details_submitted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Orders table (Stripe Checkout & Connect Payout Records — server-managed via service_role)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  listing_title VARCHAR(255) NOT NULL,
  seller_email VARCHAR(255) NOT NULL,
  seller_stripe_account_id VARCHAR(255) NOT NULL,
  buyer_email VARCHAR(255),
  amount_total DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL,
  seller_payout DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  stripe_checkout_session_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'paid',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  buyer_email VARCHAR(255) NOT NULL,
  seller_email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Storage buckets: public bucket for listing images, private bucket for Stripe state
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('stripe-connect-state', 'stripe-connect-state', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (only for listing-images; stripe-connect-state is private / service_role only)
DROP POLICY IF EXISTS "Anyone can upload listing images" ON storage.objects;
CREATE POLICY "Anyone can upload listing images" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'listing-images');

DROP POLICY IF EXISTS "Anyone can view listing images" ON storage.objects;
CREATE POLICY "Anyone can view listing images" ON storage.objects
FOR SELECT USING (bucket_id = 'listing-images');

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_seller_email ON listings(seller_email);
CREATE INDEX IF NOT EXISTS idx_sellers_email ON sellers(email);
CREATE INDEX IF NOT EXISTS idx_sellers_stripe_account_id ON sellers(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_orders_listing_id ON orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_messages_listing_id ON messages(listing_id);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for listings: public read; writes and status updates happen via server API (service_role)
DROP POLICY IF EXISTS "Anyone can view listings" ON listings;
CREATE POLICY "Anyone can view listings" ON listings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create listings" ON listings;
CREATE POLICY "Anyone can create listings" ON listings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update listings" ON listings;
DROP POLICY IF EXISTS "Users can update their own listings" ON listings;
CREATE POLICY "Users can update their own listings" ON listings
FOR UPDATE USING (seller_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policies for sellers & orders: locked down (no anon access; server uses SUPABASE_SERVICE_ROLE_KEY)
DROP POLICY IF EXISTS "Anyone can view sellers" ON sellers;
DROP POLICY IF EXISTS "Anyone can upsert sellers" ON sellers;
DROP POLICY IF EXISTS "Anyone can update sellers" ON sellers;
DROP POLICY IF EXISTS "Anyone can view orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;

-- Policies for messages
DROP POLICY IF EXISTS "Anyone can view messages" ON messages;
CREATE POLICY "Anyone can view messages" ON messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create messages" ON messages;
CREATE POLICY "Anyone can create messages" ON messages FOR INSERT WITH CHECK (true);

-- 8. Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sellers_updated_at ON sellers;
CREATE TRIGGER update_sellers_updated_at BEFORE UPDATE ON sellers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
