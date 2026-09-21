-- Esquema de "Mis Pendientes" para Supabase.
-- Pega y ejecuta esto una vez en tu proyecto: Supabase Dashboard -> SQL Editor -> New query.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  name text not null,
  seed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  project_id uuid references public.projects(id) on delete set null,
  tipificado text not null,
  anchor_month text,
  anchor_week text,
  deadline date,
  sort_order integer not null default 0,
  done boolean not null default false,
  seed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  x integer not null default 0,
  y integer not null default 0,
  seed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists notes_user_id_idx on public.notes(user_id);

alter table public.projects enable row level security;
alter table public.items enable row level security;
alter table public.notes enable row level security;

create policy "projects_select_own" on public.projects for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = user_id);

create policy "items_select_own" on public.items for select using (auth.uid() = user_id);
create policy "items_insert_own" on public.items for insert with check (auth.uid() = user_id);
create policy "items_update_own" on public.items for update using (auth.uid() = user_id);
create policy "items_delete_own" on public.items for delete using (auth.uid() = user_id);

create policy "notes_select_own" on public.notes for select using (auth.uid() = user_id);
create policy "notes_insert_own" on public.notes for insert with check (auth.uid() = user_id);
create policy "notes_update_own" on public.notes for update using (auth.uid() = user_id);
create policy "notes_delete_own" on public.notes for delete using (auth.uid() = user_id);

-- Migración 2026-09-20: campo de nota amplia por pendiente (una hoja libre
-- para escribir lo que sea sobre ese pendiente en particular). Si ya
-- ejecutaste este archivo antes, corre solo esta línea de aquí abajo — el
-- "if not exists" hace que sea seguro pegarla otra vez sin romper nada.
alter table public.items add column if not exists notes text;
