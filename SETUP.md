# 🛠️ Setup & Deployment Guide

This guide covers connecting your **Supabase** backend and deploying to **Vercel**.

---

## 1. Supabase Setup

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a new project.

2. **Run the Database Schema**
   - In the Supabase Dashboard, navigate to **SQL Editor** → **New Query**.
   - Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
   - This creates:
     - `listings` table
     - `messages` table
     - `listing-images` public storage bucket
     - Row Level Security (RLS) policies and performance indexes

3. **Copy Your API Credentials**
   - Go to **Project Settings** → **API**.
   - Copy the **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`) and **anon public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

4. **Configure Local Environment**
   - Create `.env.local` in the project root:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
     # Optional: Enable instant email notifications to sellers via Resend
     RESEND_API_KEY=re_your_api_key_here
     EMAIL_FROM=Marketplace <onboarding@resend.dev>
     ```

5. **Populate Initial Sample Data (Optional)**
   - Once your app is running and connected to Supabase, if your `listings` table is empty, simply click the **"Load Sample Listings"** button on the homepage empty state to insert 10 sample listings directly into your Supabase database.

---

## 2. Vercel Deployment

1. **Push to GitHub / Git Provider**
   ```bash
   git add .
   git commit -m "feat: complete Marketplace application"
   git push origin main
   ```

2. **Import Project in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new) and import your repository.
   - Framework Preset: **Next.js** (auto-detected).

3. **Add Environment Variables in Vercel**
   - Add the following in the Vercel project settings:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `RESEND_API_KEY` (optional, for instant seller emails)
     - `EMAIL_FROM` (optional, defaults to `Marketplace <onboarding@resend.dev>`)
     - `NEXT_PUBLIC_SITE_URL` (optional, canonical Vercel URL for links in notification emails)

4. **Deploy**
   - Click **Deploy**. Next.js 15 will build and deploy your application.
