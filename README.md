# Local Marketplace (`marketplace-demo`)

A full-stack local marketplace application built with **Next.js 15 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS**, **Shadcn UI**, and **Supabase** (PostgreSQL + Storage).

## ✨ Key Features

- **Marketplace Browse & Discovery**: Responsive 1–5 column item grid with real-time search, category filter pills, and sidebar navigation across 19 categories.
- **Create Listing with Live Preview**: Drag-and-drop image upload to Supabase Storage (`listing-images` bucket) paired with a split-screen, real-time listing preview.
- **Item Detail View & Messaging**: Full-bleed ambient image viewer, item specifications, seller profile, quick-message presets, and live buyer-to-seller messaging stored in Supabase.
- **Resilient Architecture**: Works out-of-the-box with built-in fallback demo data prior to configuring `.env.local`, and switches automatically to live Supabase persistence once credentials are provided.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory (or copy `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Initialize Supabase Database & Storage

Open your Supabase project's **SQL Editor** and run the contents of [`schema.sql`](./schema.sql) (also available as [`supabase-schema.sql`](./supabase-schema.sql)). This creates:
- `listings` table with RLS policies and `updated_at` trigger
- `messages` table with foreign key cascade and RLS policies
- `listing-images` public storage bucket and upload/view policies

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── listings/          # GET (search/filter) & POST (create/seed) listings
│   │   ├── listings/[id]/     # GET individual listing by UUID
│   │   ├── messages/          # GET & POST buyer-seller messages
│   │   └── upload/            # POST multipart image upload to Supabase Storage
│   ├── category/
│   │   ├── electronics/       # Static category route example
│   │   └── [slug]/            # Dynamic category browsing routes
│   ├── create/
│   │   ├── page.tsx           # Listing type selection screen
│   │   └── item/page.tsx      # Create item form + live preview
│   ├── item/[id]/page.tsx     # Dynamic item detail & seller messaging page
│   ├── globals.css            # Tailwind CSS & custom theme variables
│   ├── layout.tsx             # Root layout with Marketplace Header
│   └── page.tsx               # Main Marketplace homepage
├── components/
│   ├── layout/
│   │   ├── header.tsx         # Top navigation bar
│   │   └── sidebar.tsx        # Category & filter sidebar navigation
│   ├── marketplace/
│   │   ├── category-view-client.tsx
│   │   ├── item-detail-client.tsx
│   │   └── item-grid.tsx      # Responsive 1-5 col grid with search & filters
│   └── ui/                    # Shadcn UI components (button, card, input, etc.)
└── lib/
    ├── categories.ts          # Category metadata, slugs, and Lucide icons
    ├── memory-store.ts        # Pre-configuration fallback store
    ├── supabase.ts            # Supabase client & TypeScript interfaces
    └── utils.ts               # Price, date, and className utilities
```

## 📚 Additional Documentation

- [`SETUP.md`](./SETUP.md) - Step-by-step Supabase & Vercel deployment instructions
- [`FEATURES.md`](./FEATURES.md) - Detailed breakdown of application features and API contracts
- [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md) - Architecture decisions and walkthrough notes
