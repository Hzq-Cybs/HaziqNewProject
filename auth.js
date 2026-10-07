/* Cadence + Supabase Auth — login, signup, reset password, update password.
 * Static-site friendly (no build). Loaded as <script type="module">.
 */
import { supabase, getCfg, cfgStatus } from "./supabase-client.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const REDIRECT_TO = window.SUPABASE_REDIRECT_TO || window.location.origin + "/";
const isConfigured = cfgStatus() === "ok";

/* ---------- overlay view switching ---------- */
const overlay = () => $("#auth-overlay");
function setAuthView(name) {
  // name: login | signup | forgot | update | check-email
  document.querySelectorAll(".auth-panel").forEach((p) => {
    p.hidden = p.dataset.view !== name;
  });
  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.view === name);
  });
  const err = $("#auth-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (name === "check-email") {
    // keep tabs on login
  }
}
function showError(msg) {
  const err = $("#auth-error");
  if (!err) return;
  err.textContent = msg;
  err.hidden = false;
}
function setBusy(busy, label = "Please wait…") {
  const btns = document.querySelectorAll("#auth-overlay button[type=submit]");
  btns.forEach((b) => {
    b.disabled = busy;
    if (busy) b.dataset.label = b.textContent;
    else if (b.dataset.label) b.textContent = b.dataset.label;
  });
  const status = $("#auth-status");
  if (status) {
    status.textContent = busy ? label : "";
    status.hidden = !busy;
  }
}

/* ---------- gate helpers ---------- */
function lockApp(locked) {
  const app = $("#app");
  if (app) app.setAttribute("aria-hidden", locked ? "true" : "false");
  const ov = overlay();
  if (ov) ov.hidden = !locked;
}
function paintUser(session) {
  const email = session?.user?.email || "";
  const emailEl = $("#user-email");
  const logoutBtn = $("#logout-btn");
  const loginBtn = $("#auth-open-btn");
  const avatar = $("#avatar");
  if (email) {
    if (emailEl) {
      emailEl.textContent = email;
      emailEl.hidden = false;
      emailEl.title = email;
    }
    if (logoutBtn) logoutBtn.hidden = false;
    if (loginBtn) loginBtn.hidden = true;
    if (avatar) avatar.textContent = email[0].toUpperCase();
  } else {
    if (emailEl) emailEl.hidden = true;
    if (logoutBtn) logoutBtn.hidden = true;
    if (loginBtn) loginBtn.hidden = false;
    if (avatar) avatar.textContent = "H";
  }
}
function notifyUserId(userId) {
  window.__cadenceUserId = userId || null;
  window.dispatchEvent(new CustomEvent("cadence:auth", { detail: { userId } }));
}

/* ---------- auth actions ---------- */
async function doLogin(e) {
  e.preventDefault();
  if (!supabase) return showError("Add your Supabase URL + anon key in supabase-config.js first.");
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if (!email || !password) return showError("Enter your email and password.");
  setBusy(true, "Signing in…");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  setBusy(false);
  if (error) return showError(error.message);
  paintUser(data.session);
  notifyUserId(data.session?.user?.id);
  lockApp(false);
  cleanAuthUrl();
}
async function doSignup(e) {
  e.preventDefault();
  if (!supabase) return showError("Add your Supabase URL + anon key in supabase-config.js first.");
  const email = $("#signup-email").value.trim();
  const p1 = $("#signup-password").value;
  const p2 = $("#signup-password2").value;
  if (!email) return showError("Enter your email.");
  if (p1.length < 6) return showError("Password must be at least 6 characters.");
  if (p1 !== p2) return showError("Passwords do not match.");
  setBusy(true, "Creating account…");
  const { data, error } = await supabase.auth.signUp({
    email,
    password: p1,
    options: { emailRedirectTo: REDIRECT_TO },
  });
  setBusy(false);
  if (error) return showError(error.message);
  // If email confirmation is on, there is no session yet.
  if (!data.session) {
    $("#check-email-addr").textContent = email;
    setAuthView("check-email");
    return;
  }
  paintUser(data.session);
  notifyUserId(data.session?.user?.id);
  lockApp(false);
}
async function doForgot(e) {
  e.preventDefault();
  if (!supabase) return showError("Add your Supabase URL + anon key in supabase-config.js first.");
  const email = $("#forgot-email").value.trim();
  if (!email) return showError("Enter your account email.");
  setBusy(true, "Sending reset link…");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: REDIRECT_TO,
  });
  setBusy(false);
  if (error) return showError(error.message);
  $("#check-email-addr").textContent = email;
  $("#check-email-hint").textContent =
    "Password reset link sent. Open it within 1 hour, then set a new password on this device.";
  setAuthView("check-email");
}
async function doUpdate(e) {
  e.preventDefault();
  if (!supabase) return showError("Supabase is not configured.");
  const p1 = $("#update-password").value;
  const p2 = $("#update-password2").value;
  if (p1.length < 6) return showError("Password must be at least 6 characters.");
  if (p1 !== p2) return showError("Passwords do not match.");
  setBusy(true, "Updating password…");
  const { data, error } = await supabase.auth.updateUser({ password: p1 });
  setBusy(false);
  if (error) return showError(error.message);
  paintUser(data.session ?? (await supabase.auth.getSession()).data.session);
  lockApp(false);
  cleanAuthUrl();
  // force app to reload user data
  const { data: s } = await supabase.auth.getSession();
  notifyUserId(s.session?.user?.id);
}
async function doLogout() {
  if (supabase) await supabase.auth.signOut();
  paintUser(null);
  notifyUserId(null);
  setAuthView("login");
  lockApp(true);
}
function cleanAuthUrl() {
  // Remove ?code=, ?type= and #access_token fragments after recovery so refresh is clean.
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("code");
    u.searchParams.delete("type");
    const cleanHash =
      window.location.hash.includes("access_token") ||
      window.location.hash.includes("type=recovery")
        ? ""
        : window.location.hash;
    history.replaceState({}, "", u.pathname + u.search + cleanHash);
  } catch {}
}

/* ---------- init ---------- */
async function init() {
  // wire tabs + links
  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.onclick = () => setAuthView(t.dataset.view);
  });
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      setAuthView(b.dataset.goto);
    };
  });
  $("#login-form")?.addEventListener("submit", doLogin);
  $("#signup-form")?.addEventListener("submit", doSignup);
  $("#forgot-form")?.addEventListener("submit", doForgot);
  $("#update-form")?.addEventListener("submit", doUpdate);
  $("#logout-btn")?.addEventListener("click", doLogout);
  $("#auth-open-btn")?.addEventListener("click", () => {
    setAuthView("login");
    lockApp(true);
  });
  $("#auth-continue-guest")?.addEventListener("click", () => {
    // Demo mode without login — uses shared local device data.
    notifyUserId(null);
    lockApp(false);
  });

  $("#cfg-save")?.addEventListener("click", () => {
    const u = $("#cfg-url")?.value.trim() || "";
    const k = $("#cfg-key")?.value.trim() || "";
    if (!u || !k) {
      showError("Paste both the Project URL and anon key first.");
      return;
    }
    if (!/^https:\/\/.+\.supabase\.co\/?$/.test(u) && !u.startsWith("https://")) {
      showError("That URL doesn't look right — it should be https://xyz.supabase.co");
      return;
    }
    try {
      localStorage.setItem("SUPABASE_URL", u);
      localStorage.setItem("SUPABASE_ANON_KEY", k);
    } catch {}
    location.reload();
  });
  $("#cfg-clear")?.addEventListener("click", () => {
    try {
      localStorage.removeItem("SUPABASE_URL");
      localStorage.removeItem("SUPABASE_ANON_KEY");
    } catch {}
    location.reload();
  });
  // Pre-fill setup form with current effective values (unless placeholders)
  try {
    const { url, anon } = getCfg();
    if (url && !url.includes("YOUR-PROJECT") && $("#cfg-url")) $("#cfg-url").value = url;
    if (anon && !anon.includes("YOUR-ANON") && $("#cfg-key")) $("#cfg-key").value = anon;
  } catch {}

  if (!isConfigured) {
    setAuthView("login");
    lockApp(true);
    showError("Supabase not configured yet — paste keys below in Supabase setup (or into supabase-config.js / .env.example), then Save. You can still Continue as guest.");
    paintUser(null);
    // Open setup so user sees where to paste (matches your screenshot)
    const det = $("#cfg-details");
    if (det) det.open = true;
    return;
  }

  // Handle password-recovery redirect (?code=... from Supabase email link)
  try {
    const u = new URL(window.location.href);
    const code = u.searchParams.get("code");
    const type = u.searchParams.get("type");
    const hash = window.location.hash || "";
    const isRecovery = type === "recovery" || hash.includes("type=recovery");
    if (code) {
      setAuthView("update");
      lockApp(true);
      setBusy(true, "Verifying reset link…");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      setBusy(false);
      if (error) {
        setAuthView("login");
        showError("Reset link expired or already used. Request a new one below.");
        setAuthView("forgot");
        const em = $("#forgot-email");
        if (em) em.focus();
        return;
      }
      paintUser(data.session);
      notifyUserId(data.session?.user?.id);
      // Stay locked on update view until they set a new password.
      setAuthView("update");
      return;
    }
    if (isRecovery) {
      // Implicit-hash flow (#access_token=...&type=recovery) — client auto-parses it.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        paintUser(data.session);
        notifyUserId(data.session?.user?.id);
        setAuthView("update");
        lockApp(true);
        return;
      }
    }
  } catch (e) {
    console.warn("recovery parse failed", e);
  }

  // Normal session check
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    paintUser(data.session);
    notifyUserId(data.session.user.id);
    lockApp(false);
  } else {
    paintUser(null);
    notifyUserId(null);
    setAuthView("login");
    lockApp(true);
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      paintUser(session);
      setAuthView("update");
      lockApp(true);
      return;
    }
    if (event === "SIGNED_IN" && session) {
      paintUser(session);
      notifyUserId(session.user.id);
      // If we are on update view (just came from reset link), stay there.
      const cur = document.querySelector('.auth-panel:not([hidden])')?.dataset.view;
      if (cur !== "update") lockApp(false);
    }
    if (event === "SIGNED_OUT") {
      paintUser(null);
      notifyUserId(null);
      setAuthView("login");
      lockApp(true);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
