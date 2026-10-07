-- Cadence schema for Supabase — paste into Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotent: safe to run more than once.
-- Auth-only tables (auth.users) are managed by Supabase; this adds app tables.

-- ---------- projects ----------
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#D14D1F',
  created_at timestamptz not null default now()
);

-- ---------- tasks ----------
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 220),
  notes text not null default '',
  due date null,
  priority smallint not null default 2 check (priority between 1 and 4),
  tags jsonb not null default '[]'::jsonb,
  subtasks jsonb not null default '[]'::jsonb,
  -- subtasks shape: [{id text, title text, done boolean}]
  estimate integer null check (estimate is null or (estimate >= 0 and estimate <= 960)),
  done boolean not null default false,
  done_at timestamptz null,
  created_at timestamptz not null default now(),
  task_order double precision not null default 0
);

-- ---------- indexes ----------
create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists tasks_due_idx on public.tasks (due);
create index if not exists tasks_done_idx on public.tasks (user_id, done);
create index if not exists projects_user_id_idx on public.projects (user_id);

-- ---------- Row Level Security ----------
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

-- Drop old policies if re-running (keeps SQL Editor re-runnable)
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;
drop policy if exists "tasks_delete_own" on public.tasks;

-- Projects: user can only touch their own rows
create policy "projects_select_own" on public.projects
  for select to authenticated using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert to authenticated with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete to authenticated using (auth.uid() = user_id);

-- Tasks: user can only touch their own rows
create policy "tasks_select_own" on public.tasks
  for select to authenticated using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using (auth.uid() = user_id);
