import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client using SUPABASE_SERVICE_ROLE_KEY when available
 * so hardened RLS policies on sensitive tables (like `messages`) cannot be bypassed directly by anon clients.
 * Never import this module from client components.
 */
export function getServerSupabaseClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServerSupabaseClient must only be used on the server");
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !rawUrl) {
    return supabase;
  }

  if (!cachedAdminClient) {
    const cleanUrl = rawUrl
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/+$/, "");

    cachedAdminClient = createClient(cleanUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedAdminClient;
}
