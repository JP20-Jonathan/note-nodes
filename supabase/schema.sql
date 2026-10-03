-- Esquema de "Mis Pendientes" para Supabase.
-- Pega y ejecuta esto una vez en tu proyecto: Supabase Dashboard -> SQL Editor -> New query.
-- Si ya lo corriste antes, es seguro volver a pegar el archivo completo — cada
-- pieza usa "if not exists" (o un guard equivalente) y no borra filas.

-- Migración 2026-09-23b: nombres técnicos más claros — "items" pasa a
-- llamarse "actividades" y "projects" pasa a llamarse "categorias" (para que
-- combinen con como se llaman en la app). RENAME TABLE conserva todas las
-- filas, columnas, llaves foráneas y RLS tal cual, no borra nada. Va PRIMERO
-- en el archivo a propósito: así, si tu base todavía tiene las tablas viejas,
-- quedan renombradas antes de que los "create table if not exists" de abajo
-- intenten crearlas de nuevo (si este bloque fuera después, esos "create"
-- crearían una "categorias"/"actividades" vacía y el rename ya no podría
-- completarse). En una base nueva (sin "items" ni "projects") este bloque
-- simplemente no encuentra nada que renombrar.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'items') then
    alter table public.items rename to actividades;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'projects') then
    alter table public.projects rename to categorias;
  end if;
end $$;

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  name text not null,
  seed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  project_id uuid references public.categorias(id) on delete set null,
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
  color text,
  collapsed boolean not null default false,
  seed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists actividades_user_id_idx on public.actividades(user_id);
create index if not exists categorias_user_id_idx on public.categorias(user_id);
create index if not exists notes_user_id_idx on public.notes(user_id);

alter table public.categorias enable row level security;
alter table public.actividades enable row level security;
alter table public.notes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias' and policyname = 'categorias_select_own') then
    create policy "categorias_select_own" on public.categorias for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias' and policyname = 'categorias_insert_own') then
    create policy "categorias_insert_own" on public.categorias for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias' and policyname = 'categorias_update_own') then
    create policy "categorias_update_own" on public.categorias for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias' and policyname = 'categorias_delete_own') then
    create policy "categorias_delete_own" on public.categorias for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'actividades' and policyname = 'actividades_select_own') then
    create policy "actividades_select_own" on public.actividades for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'actividades' and policyname = 'actividades_insert_own') then
    create policy "actividades_insert_own" on public.actividades for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'actividades' and policyname = 'actividades_update_own') then
    create policy "actividades_update_own" on public.actividades for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'actividades' and policyname = 'actividades_delete_own') then
    create policy "actividades_delete_own" on public.actividades for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_select_own') then
    create policy "notes_select_own" on public.notes for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_insert_own') then
    create policy "notes_insert_own" on public.notes for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_update_own') then
    create policy "notes_update_own" on public.notes for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_delete_own') then
    create policy "notes_delete_own" on public.notes for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Migración 2026-09-20: campo de nota amplia por pendiente (una hoja libre
-- para escribir lo que sea sobre esa actividad en particular).
alter table public.actividades add column if not exists notes text;

-- Migración 2026-09-23a: notas adhesivas ahora se pueden arrastrar (x/y ya
-- existían), colapsar tipo acordeón (para no estorbar en pantalla completa)
-- y cambiar de color con clic derecho.
alter table public.notes add column if not exists color text;
alter table public.notes add column if not exists collapsed boolean not null default false;
