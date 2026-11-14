# 🛠️ Setup & Deployment Guide (Supabase + Stripe Connect + Vercel)

This guide covers configuring **Supabase**, **Stripe Connect**, and deploying to **Vercel**.

---

## 1. Supabase Setup

1. Open your Supabase project's **SQL Editor** → **New Query**.
2. Paste the contents of [`schema.sql`](./schema.sql) and click **Run**.
   - `schema.sql` is idempotent (`IF NOT EXISTS`), so it safely upgrades an existing Test 3 database or initializes a fresh database with `listings`, `sellers`, `orders`, `messages`, the `listing-images` bucket, and the private `stripe-connect-state` storage bucket.
   - Even before running the SQL migration, the backend also mirrors seller and order state in a private Supabase Storage bucket (`stripe-connect-state`) so onboarding and checkout work seamlessly out of the box.

---

## 2. Environment Variables (`.env.local` & Vercel)

Configure the following environment variables in `.env.local` locally and in your **Vercel Project Settings → Environment Variables**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 3. Deploy to Vercel & Register Stripe Connect Webhook

1. **Push to GitHub & Deploy on Vercel**:
   ```bash
   git add .
   git commit -m "feat: add Stripe Connect onboarding, checkout, and webhooks"
   git push origin main
   ```
2. **Register Your Production Webhook Endpoint**:
   Once deployed on Vercel, run [`scripts/create-webhook.mjs`](./scripts/create-webhook.mjs) with your public production Vercel URL:
   ```bash
   node --env-file=.env.local scripts/create-webhook.mjs https://YOUR-APP.vercel.app
   ```
3. **Save the Signing Secret (`STRIPE_WEBHOOK_SECRET`)**:
   Copy the printed `whsec_...` value into `.env.local` and into Vercel Environment Variables as `STRIPE_WEBHOOK_SECRET`, then redeploy on Vercel.
