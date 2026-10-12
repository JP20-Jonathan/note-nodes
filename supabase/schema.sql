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

-- Migración 2026-10-11: "actividades" pasa a llamarse "pendientes" — coincide
-- con como ya se le dice en toda la UI (el sol del Árbol dice "Pendientes",
-- el tab dice "Pendientes"; "actividad" solo sobrevivía en el nombre técnico
-- de la tabla). Mismo mecanismo que la migración de arriba — RENAME conserva
-- filas/columnas/llaves — y de paso se renombran el índice y las políticas
-- de RLS para que coincidan con el nombre nuevo. Va antes de los "create
-- table if not exists" por la misma razón que el bloque anterior.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'actividades') then
    alter table public.actividades rename to pendientes;
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'actividades_user_id_idx') then
    alter index public.actividades_user_id_idx rename to pendientes_user_id_idx;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'actividades_select_own') then
    alter policy "actividades_select_own" on public.pendientes rename to "pendientes_select_own";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'actividades_insert_own') then
    alter policy "actividades_insert_own" on public.pendientes rename to "pendientes_insert_own";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'actividades_update_own') then
    alter policy "actividades_update_own" on public.pendientes rename to "pendientes_update_own";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'actividades_delete_own') then
    alter policy "actividades_delete_own" on public.pendientes rename to "pendientes_delete_own";
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

create table if not exists public.pendientes (
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

create index if not exists pendientes_user_id_idx on public.pendientes(user_id);
create index if not exists categorias_user_id_idx on public.categorias(user_id);
create index if not exists notes_user_id_idx on public.notes(user_id);

alter table public.categorias enable row level security;
alter table public.pendientes enable row level security;
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

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'pendientes_select_own') then
    create policy "pendientes_select_own" on public.pendientes for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'pendientes_insert_own') then
    create policy "pendientes_insert_own" on public.pendientes for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'pendientes_update_own') then
    create policy "pendientes_update_own" on public.pendientes for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pendientes' and policyname = 'pendientes_delete_own') then
    create policy "pendientes_delete_own" on public.pendientes for delete using (auth.uid() = user_id);
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
alter table public.pendientes add column if not exists notes text;

-- Migración 2026-09-23a: notas adhesivas ahora se pueden arrastrar (x/y ya
-- existían), colapsar tipo acordeón (para no estorbar en pantalla completa)
-- y cambiar de color con clic derecho.
alter table public.notes add column if not exists color text;
alter table public.notes add column if not exists collapsed boolean not null default false;

-- Migración 2026-10-10: el tipificado "siguientes_actividades" pasa a
-- llamarse "en_curso" (es donde ahora se arrastran las actividades que se
-- están trabajando activamente, modo focus). tipificado es texto libre sin
-- check constraint, así que esto es solo un dato a corregir, no un cambio
-- de esquema — correr una sola vez, es seguro volver a correrlo (después de
-- la primera vez no actualiza ninguna fila porque ya no queda ninguna con
-- el valor viejo).
update public.pendientes set tipificado = 'en_curso' where tipificado = 'siguientes_actividades';

-- Migración 2026-10-10b: vista de "Completados" — necesita saber CUÁNDO se
-- marcó hecho cada pendiente (antes solo se sabía que `done = true`, sin
-- fecha). Columna aditiva, no toca filas existentes (quedan con done_at
-- null hasta la próxima vez que se marquen/desmarquen).
alter table public.pendientes add column if not exists done_at timestamptz;

-- Migración 2026-10-11b: subpendientes — un pendiente puede desglosarse en
-- tareas más chicas, cada una con su propio nombre y nota (la descripción
-- del subpendiente); todo lo demás (categoría, proyecto, tipificado, fecha
-- límite...) lo hereda del pendiente padre, así que no se repite acá.
-- "on delete cascade" en pendiente_id: borrar el pendiente padre borra sus
-- subpendientes, nunca quedan huérfanos.
create table if not exists public.subpendientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pendiente_id uuid not null references public.pendientes(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists subpendientes_user_id_idx on public.subpendientes(user_id);
create index if not exists subpendientes_pendiente_id_idx on public.subpendientes(pendiente_id);

alter table public.subpendientes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subpendientes' and policyname = 'subpendientes_select_own') then
    create policy "subpendientes_select_own" on public.subpendientes for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subpendientes' and policyname = 'subpendientes_insert_own') then
    create policy "subpendientes_insert_own" on public.subpendientes for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subpendientes' and policyname = 'subpendientes_update_own') then
    create policy "subpendientes_update_own" on public.subpendientes for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subpendientes' and policyname = 'subpendientes_delete_own') then
    create policy "subpendientes_delete_own" on public.subpendientes for delete using (auth.uid() = user_id);
  end if;
end $$;
