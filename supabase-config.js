/* Supabase config for Cadence — fill in from Supabase Dashboard.
 * Project Settings → Data API → Project URL
 * Project Settings → API Keys → anon public key
 * Then in Supabase Dashboard → Authentication → URL Configuration:
 *   Site URL = your Vercel URL (e.g. https://haziq-new-project.vercel.app)
 *   Redirect URLs += http://localhost:5173 , your Vercel URL, your Vercel URL + /**
 */
window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
// Where password-recovery emails should send users back to.
// Keep as origin so it works on localhost + Vercel without edits.
window.SUPABASE_REDIRECT_TO = window.location.origin + "/";
