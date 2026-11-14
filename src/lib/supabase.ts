import { createClient } from "@supabase/supabase-js";

// Fallback values for build process (Step 9 & Challenge 3 in development guide)
const rawSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
// Normalize URL in case "/rest/v1/" is included
const supabaseUrl = rawSupabaseUrl
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/+$/, "");
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co" &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-id") &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "placeholder-key"
  );
}

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  seller_email: string;
  image_url: string | null;
  location: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  listing_id: string;
  buyer_email: string;
  seller_email: string;
  message: string;
  created_at: string;
}

export const SAMPLE_LISTINGS: Listing[] = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    title: "MacBook Pro 16-inch M3 Max (36GB RAM, 1TB SSD)",
    description:
      "Mint condition Space Black MacBook Pro 16-inch with M3 Max chip, 36GB unified memory, and 1TB SSD. Includes original MagSafe 3 charger and box. Battery health at 99% with only 24 cycles. Selling because my company issued a new work laptop.",
    price: 2150,
    category: "electronics",
    seller_email: "alex.chen@stanford.edu",
    image_url:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1000&q=80",
    location: "Palo Alto, CA",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111102",
    title: "Herman Miller Aeron Ergonomic Office Chair - Size B",
    description:
      "Authentic Herman Miller Aeron Remastered in Graphite, Size B (Medium). Fully loaded with adjustable PostureFit SL, tilt limiter, seat angle adjustment, and multi-surface casters. Smoke-free home office.",
    price: 580,
    category: "home-goods",
    seller_email: "sarah.miller@gmail.com",
    image_url:
      "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=1000&q=80",
    location: "Menlo Park, CA",
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111103",
    title: "Sony Alpha a7 IV Mirrorless Camera + 24-70mm GM II",
    description:
      "Sony a7 IV body in flawless condition paired with the FE 24-70mm f/2.8 GM II lens. Low shutter count (<4,200). Comes with 2 Sony NP-FZ100 batteries, dual charger, Peak Design strap, and carrying bag.",
    price: 2600,
    category: "electronics",
    seller_email: "david.photo@outlook.com",
    image_url:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80",
    location: "Mountain View, CA",
    created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111104",
    title: "Specialized Tarmac SL7 Comp Carbon Road Bike (56cm)",
    description:
      "2023 Specialized Tarmac SL7 Comp with Shimano 105 Di2 12-speed electronic shifting. Frame size 56cm. Upgraded Roval C38 carbon wheelset and Continental GP5000 tires. Freshly tuned up at local bike shop.",
    price: 2950,
    category: "sporting-goods",
    seller_email: "marco.velo@gmail.com",
    image_url:
      "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80",
    location: "Palo Alto, CA",
    created_at: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111105",
    title: "Mid-Century Modern Walnut Dining Table + 6 Chairs",
    description:
      "Solid American walnut mid-century dining table (72\" x 36\") with 6 matching upholstered dining chairs. Purchased from West Elm 18 months ago for $2,400. Moving out of state this weekend, priced to sell!",
    price: 750,
    category: "home-goods",
    seller_email: "elena.design@yahoo.com",
    image_url:
      "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=1000&q=80",
    location: "Sunnyvale, CA",
    created_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111106",
    title: "Fender American Professional II Stratocaster",
    description:
      "Olympic White with rosewood fretboard. V-Mod II single-coil Strat pickups, 2-point tremolo with cold-rolled steel block. Includes original Fender molded hardshell case and certificate of authenticity.",
    price: 1190,
    category: "musical-instruments",
    seller_email: "liam.guitar@gmail.com",
    image_url:
      "https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?auto=format&fit=crop&w=1000&q=80",
    location: "Redwood City, CA",
    created_at: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111107",
    title: "Apple Studio Display 27-inch 5K Retina (Tilt-Adjustable)",
    description:
      "Apple 27-inch 5K Retina Studio Display with standard glass and tilt-adjustable stand. Built-in 12MP Ultra Wide camera with Center Stage and 6-speaker spatial audio system. Includes Thunderbolt 4 cable.",
    price: 1150,
    category: "electronics",
    seller_email: "kevin.dev@icloud.com",
    image_url:
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1000&q=80",
    location: "Cupertino, CA",
    created_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111108",
    title: "2021 Rivian R1T Launch Edition Quad-Motor AWD",
    description:
      "Launch Green exterior with Black Mountain interior. Large battery pack (314 mi range), powered tonneau cover, Meridian sound system, Camp Kitchen gear tunnel shuttle, and off-road underbody shield. Clean title.",
    price: 54900,
    category: "vehicles",
    seller_email: "jordan.ev@gmail.com",
    image_url:
      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1000&q=80",
    location: "Palo Alto, CA",
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111109",
    title: "Breville Barista Touch Espresso Machine (Brushed Steel)",
    description:
      "Breville Barista Touch BES880BSS with intuitive touchscreen, integrated conical burr grinder, and automatic microfoam milk texturing. Recently descaled, includes portafilter, baskets, milk jug, and water filters.",
    price: 520,
    category: "home-goods",
    seller_email: "chloe.coffee@gmail.com",
    image_url:
      "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=1000&q=80",
    location: "Los Altos, CA",
    created_at: new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "11111111-1111-4111-8111-111111111110",
    title: "Nintendo Switch OLED + Zelda Tears of the Kingdom + Pro Controller",
    description:
      "White Nintendo Switch OLED console in like-new condition with tempered glass screen protector installed day one. Includes dock, Joy-Cons, official Pro Controller, carrying case, and Zelda: Tears of the Kingdom.",
    price: 290,
    category: "entertainment",
    seller_email: "ryan.games@gmail.com",
    image_url:
      "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80",
    location: "San Mateo, CA",
    created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  },
];
