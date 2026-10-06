import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabase = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = hasSupabase
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
