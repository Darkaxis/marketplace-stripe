# Local Marketplace + Stripe Connect (`marketplace-demo`)

A full-stack local marketplace application built with **Next.js 15 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS**, **Shadcn UI**, **Supabase** (PostgreSQL + Storage), and **Stripe Connect** (Hosted Onboarding, Direct Charges with 10% Platform Fee, and Connect Webhooks).

## ✨ Key Features

- **Stripe Connect Seller Onboarding (`/connect`)**: Sellers enter their email and click **Connect with Stripe** to complete Stripe's hosted onboarding. Their connected account ID (`acct_...`) and onboarding status are saved in Supabase.
- **Buy Now with Stripe Checkout**: Listings from onboarded sellers display a **Buy Now** button that launches Stripe Checkout for that item's price. Listings from sellers who haven't onboarded are not purchasable.
- **Direct Charges & 10% Platform Fee**: Payments are created on the seller's connected account (`stripeAccount`) with a 10% marketplace `application_fee_amount` (90% net payout to the seller).
- **Order Confirmation & Stripe Connect Webhooks (`/api/stripe/webhook` & `/checkout/success`)**: Verified `checkout.session.completed` and `account.updated` webhooks (with `STRIPE_WEBHOOK_SECRET` signature verification and shared-sandbox event filtering) record orders in Supabase and mark purchased listings as **Sold**.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the root directory (see [`.env.example`](./.env.example)):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Initialize / Upgrade Supabase Schema

Open your Supabase project's **SQL Editor** and run [`schema.sql`](./schema.sql) (idempotent on both fresh projects and existing Test 3 databases).

### 4. Register Your Stripe Connect Webhook

After deploying to Vercel, register your webhook endpoint using [`scripts/create-webhook.mjs`](./scripts/create-webhook.mjs):

```bash
node --env-file=.env.local scripts/create-webhook.mjs https://YOUR-APP.vercel.app
```

Add the printed `whsec_...` value as `STRIPE_WEBHOOK_SECRET` in `.env.local` and Vercel Environment Variables, then redeploy.
