import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | undefined;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL?.trim();
  const key = (
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!url || !key) {
    throw new Error(
      "La connexion à la base de données est indisponible.",
    );
  }

  adminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "family-expense-tracker-server" },
    },
  });

  return adminClient;
}

export function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
