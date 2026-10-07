/* Shared Supabase client for Cadence (auth + cloud sync). Static-site friendly. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export function getCfg() {
  let url = "";
  let anon = "";
  try {
    url = localStorage.getItem("SUPABASE_URL") || window.SUPABASE_URL || "";
    anon =
      localStorage.getItem("SUPABASE_ANON_KEY") ||
      window.SUPABASE_ANON_KEY ||
      "";
  } catch {
    url = window.SUPABASE_URL || "";
    anon = window.SUPABASE_ANON_KEY || "";
  }
  return { url: (url || "").trim(), anon: (anon || "").trim() };
}

export function cfgStatus() {
  const { url, anon } = getCfg();
  if (!url || !anon) return "missing";
  if (url.includes("YOUR-PROJECT") || anon.includes("YOUR-ANON")) return "placeholder";
  return "ok";
}

const { url: SB_URL, anon: SB_ANON } = getCfg();

export const supabase = cfgStatus() === "ok"
  ? createClient(SB_URL, SB_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Classic scripts (app.js) read the client through window.
window.__cadenceSupabase = supabase;
