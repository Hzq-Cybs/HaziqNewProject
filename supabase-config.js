/* Supabase config for Cadence — runtime for this static site.
 * Order of precedence:
 *   1. localStorage override (set via in-app Supabase setup form — survives redeploys on same browser)
 *   2. Values below (edit + push to update for everyone; keep in sync with .env.example)
 *
 * Fill in from Supabase Dashboard:
 *   Project Settings → Data API → Project URL
 *   Project Settings → API Keys → anon / publishable key
 * Then in Supabase Dashboard → Authentication → URL Configuration:
 *   Site URL = your Vercel URL (e.g. https://haziq-new-project.vercel.app)
 *   Redirect URLs += http://localhost:5173/** , your Vercel URL + /**
 */
try {
  window.SUPABASE_URL =
    localStorage.getItem("SUPABASE_URL") || "https://zivdxmxbsntburlrcdkr.supabase.co";
  window.SUPABASE_ANON_KEY =
    localStorage.getItem("SUPABASE_ANON_KEY") || "sb_publishable_GB7PG92ZL9bZdIq7Cj4ejg_I_6xHYyz";
} catch {
  window.SUPABASE_URL = "https://zivdxmxbsntburlrcdkr.supabase.co";
  window.SUPABASE_ANON_KEY = "sb_publishable_GB7PG92ZL9bZdIq7Cj4ejg_I_6xHYyz";
}
// Where password-recovery emails should send users back to.
// Keep as origin so it works on localhost + Vercel without edits.
window.SUPABASE_REDIRECT_TO = window.location.origin + "/";
