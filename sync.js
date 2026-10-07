/* Cadence cloud sync — Supabase Postgres as source of truth per user.
 * Strategy: localStorage stays as instant cache/offline fallback.
 *  - On login: pull cloud → if cloud empty and local has rows, push local up
 *    (first-login migration); else overwrite local cache with cloud rows.
 *  - On every local save (app.js dispatches `cadence:save`): debounced
 *    full upsert + delete reconciliation.
 * Loaded as <script type="module"> after app.js/auth.js.
 */
import { supabase, cfgStatus } from "./supabase-client.js";

const LS_BASE = "cadence.v1";
const lsKey = () =>
  window.__cadenceUserId ? `${LS_BASE}.${window.__cadenceUserId}` : LS_BASE;

const $ = (s, r = document) => r.querySelector(s);

function setSync(mode, label) {
  // mode: guest | syncing | synced | offline | disabled
  const el = $("#sync-status");
  if (!el) return;
  el.dataset.mode = mode;
  const dot = mode === "synced" ? "● " : mode === "syncing" ? "◌ " : mode === "offline" ? "○ " : "";
  el.textContent = dot + (label || mode);
  el.title =
    mode === "synced"
      ? "All changes saved to Supabase"
      : mode === "syncing"
        ? "Saving to Supabase…"
        : mode === "offline"
          ? "Offline — changes kept on this device, will retry"
          : mode === "guest"
            ? "Guest mode — sign in to sync across devices"
            : "Cloud sync unavailable — check Supabase keys";
}

/* ---------- mapping: app shape <-> row shape ---------- */
const toISOorNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    try {
      return new Date(v).toISOString();
    } catch {
      return null;
    }
  }
  return v; // assume ISO string already
};
const toMs = (v, fallback = Date.now()) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : fallback;
};

function toCloudProject(p, userId) {
  return {
    id: String(p.id),
    user_id: userId,
    name: String(p.name || "Untitled").slice(0, 40),
    color: p.color || "#D14D1F",
    created_at: toISOorNull(p.createdAt) || new Date().toISOString(),
  };
}
function fromCloudProject(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: toMs(r.created_at),
  };
}
function toCloudTask(t, userId, validPids) {
  const pid = String(t.projectId || "");
  if (!pid || (validPids && !validPids.has(pid))) return null; // skip dangling refs — never block the whole batch
  const due = /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : null;
  return {
    id: String(t.id),
    user_id: userId,
    project_id: pid,
    title: String(t.title || "Untitled").slice(0, 220),
    notes: String(t.notes || "").slice(0, 2000),
    due,
    priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : 2,
    tags: Array.isArray(t.tags) ? t.tags : [],
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    estimate:
      t.estimate === null || t.estimate === undefined
        ? null
        : Math.max(0, Math.min(960, +t.estimate || 0)),
    done: !!t.done,
    done_at: t.done ? toISOorNull(t.doneAt) || new Date().toISOString() : null,
    created_at: toISOorNull(t.createdAt) || new Date().toISOString(),
    task_order: typeof t.order === "number" ? t.order : 0,
  };
}
function fromCloudTask(r) {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes || "",
    projectId: r.project_id,
    due: r.due || null,
    priority: r.priority ?? 2,
    tags: Array.isArray(r.tags) ? r.tags : [],
    subtasks: Array.isArray(r.subtasks) ? r.subtasks : [],
    estimate: r.estimate ?? null,
    done: !!r.done,
    doneAt: r.done_at ? toMs(r.done_at) : null,
    createdAt: toMs(r.created_at),
    order: typeof r.task_order === "number" ? r.task_order : 0,
  };
}

/* ---------- local cache access ---------- */
function readLocal() {
  try {
    const raw = localStorage.getItem(lsKey());
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!Array.isArray(d.tasks) || !Array.isArray(d.projects)) return null;
    return d;
  } catch {
    return null;
  }
}
function writeLocalCache(projects, tasks) {
  // Preserve per-device UI state (history/focus) — cloud owns projects/tasks only.
  const cur = readLocal() || {};
  const open = tasks.filter((t) => !t.done);
  let focusId = cur.focusId;
  if (!focusId || !tasks.some((t) => t.id === focusId && !t.done)) {
    focusId = open[0]?.id || tasks[0]?.id || null;
  }
  // Reindex order to keep manual sort stable
  const sorted = tasks.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  sorted.forEach((t, i) => (t.order = i));
  const next = {
    projects,
    tasks: sorted,
    history: cur.history || {},
    focusId,
    createdAt: cur.createdAt || Date.now(),
  };
  try {
    localStorage.setItem(lsKey(), JSON.stringify(next));
  } catch {}
  return next;
}

/* ---------- cloud ops ---------- */
let syncTimer = null;
let syncing = false;
let lastPullAt = 0;

function needSync() {
  return cfgStatus() === "ok" && !!supabase && !!window.__cadenceUserId;
}

export function schedule(ms = 900) {
  if (!needSync()) return;
  setSync("syncing", "Saving…");
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushAll().catch((e) => console.warn("push failed", e)), ms);
}

export async function pull() {
  const userId = window.__cadenceUserId;
  if (cfgStatus() !== "ok" || !supabase) {
    setSync("disabled", "Setup needed");
    return;
  }
  if (!userId) {
    setSync("guest", "Guest");
    return;
  }
  setSync("syncing", "Syncing…");
  lastPullAt = Date.now();
  let projRows, taskRows;
  try {
    const [p, t] = await Promise.all([
      supabase.from("projects").select("*").eq("user_id", userId),
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .order("task_order", { ascending: true }),
    ]);
    if (p.error) throw p.error;
    if (t.error) throw t.error;
    projRows = p.data || [];
    taskRows = t.data || [];
  } catch (e) {
    console.warn("cloud pull failed", e);
    setSync("offline", "Offline");
    return;
  }
  const local = readLocal();
  const localCount = (local?.projects?.length || 0) + (local?.tasks?.length || 0);
  if (projRows.length === 0 && taskRows.length === 0 && localCount > 0) {
    // First login with existing device data → migrate up.
    await pushAll();
    return;
  }
  if (projRows.length === 0 && taskRows.length === 0) {
    setSync("synced", "Synced");
    return;
  }
  const projects = projRows.map(fromCloudProject);
  const validPids = new Set(projects.map((p) => p.id));
  const tasks = taskRows
    .filter((r) => validPids.has(r.project_id))
    .map(fromCloudTask);
  writeLocalCache(projects, tasks);
  setSync("synced", "Synced");
  // Let app.js reload in-memory db from the updated cache and re-render.
  window.dispatchEvent(new CustomEvent("cadence:pull"));
}

export async function pushAll() {
  const userId = window.__cadenceUserId;
  if (!needSync()) return;
  if (syncing) {
    schedule(900);
    return;
  }
  syncing = true;
  setSync("syncing", "Saving…");
  try {
    const local = readLocal();
    const projects = (local?.projects || []).map((p) => toCloudProject(p, userId));
    const validPids = new Set(projects.map((p) => p.id));
    const tasks = (local?.tasks || [])
      .map((t) => toCloudTask(t, userId, validPids))
      .filter(Boolean);
    // Upsert parents first (tasks reference projects).
    if (projects.length) {
      const { error } = await supabase.from("projects").upsert(projects, { onConflict: "id" });
      if (error) throw error;
    }
    if (tasks.length) {
      const { error } = await supabase.from("tasks").upsert(tasks, { onConflict: "id" });
      if (error) throw error;
    }
    // Delete reconciliation: remove cloud rows deleted on this device.
    const localPids = new Set(projects.map((p) => p.id));
    const localTids = new Set(tasks.map((t) => t.id));
    const [cp, ct] = await Promise.all([
      supabase.from("projects").select("id").eq("user_id", userId),
      supabase.from("tasks").select("id").eq("user_id", userId),
    ]);
    if (!cp.error) {
      const gone = (cp.data || []).map((r) => r.id).filter((id) => !localPids.has(id));
      if (gone.length) {
        const { error } = await supabase.from("projects").delete().in("id", gone).eq("user_id", userId);
        if (error) throw error;
      }
    }
    if (!ct.error) {
      const gone = (ct.data || []).map((r) => r.id).filter((id) => !localTids.has(id));
      if (gone.length) {
        const { error } = await supabase.from("tasks").delete().in("id", gone).eq("user_id", userId);
        if (error) throw error;
      }
    }
    setSync("synced", "Synced");
  } catch (e) {
    console.warn("cloud push failed", e);
    setSync("offline", "Offline");
    // Retry once after a pause (e.g. transient network blip).
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushAll().catch(() => {}), 8000);
  } finally {
    syncing = false;
  }
}

/* ---------- events ---------- */
window.addEventListener("cadence:save", () => schedule());
window.addEventListener("cadence:auth", (e) => {
  const uid = e.detail?.userId || window.__cadenceUserId || null;
  if (!uid) {
    setSync("guest", "Guest");
    return;
  }
  // app.js reloads local cache first (its own listener); pull after a beat
  // so migration sees the reloaded device data.
  setTimeout(() => pull().catch((err) => console.warn("pull failed", err)), 350);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (!needSync()) return;
  if (Date.now() - lastPullAt < 15000) return;
  pull().catch(() => {});
});

// Initial paint (auth.js resolves session async and dispatches cadence:auth).
if (!window.__cadenceUserId) setSync("guest", "Guest");

window.CadenceCloud = { pull, pushAll, schedule };
