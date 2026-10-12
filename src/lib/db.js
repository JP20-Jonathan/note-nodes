// Capa de acceso a datos sobre Supabase (tablas pendientes/subpendientes/
// categorias/notes en la base — "items"/"projects" en el nombre de tabla
// original, renombrada a "actividades" en 2026-09-23 y a "pendientes" en
// 2026-10-11 — una fila por registro, con RLS por user_id). Traduce entre
// las columnas de la base (snake_case, project_id/anchor_month/sort_order)
// y la forma que ya espera el resto de la app (camelCase, projects
// agrupados por categoría) para no tener que tocar businessRules.js/
// useArbolViewModel — el runtime JS sigue hablando de "items"/"projects",
// solo cambió el nombre de la tabla en Postgres.
import { supabase } from "./supabaseClient.js";

function rowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    projectId: row.project_id,
    tipificado: row.tipificado,
    anchorMonth: row.anchor_month,
    anchorWeek: row.anchor_week,
    deadline: row.deadline,
    order: row.sort_order,
    done: row.done,
    doneAt: row.done_at ? new Date(row.done_at).getTime() : null,
    seed: row.seed,
    notes: row.notes || "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToProject(row) {
  return { id: row.id, name: row.name, seed: row.seed };
}

function rowToNote(row) {
  return { id: row.id, text: row.text, x: row.x, y: row.y, seed: row.seed, color: row.color || null, collapsed: !!row.collapsed };
}

// Un SubPendiente solo tiene nombre y nota propios — categoría, proyecto,
// tipificado, fecha límite, etc. los hereda del pendiente padre (ver
// pendienteId), así que no se duplican acá.
function rowToSubPendiente(row) {
  return { id: row.id, pendienteId: row.pendiente_id, name: row.name, notes: row.notes || "", createdAt: new Date(row.created_at).getTime() };
}

export async function fetchAllData(userId) {
  const [itemsRes, projectsRes, notesRes, subPendientesRes] = await Promise.all([
    supabase.from("pendientes").select("*").eq("user_id", userId).order("sort_order", { ascending: true }),
    supabase.from("categorias").select("*").eq("user_id", userId),
    supabase.from("notes").select("*").eq("user_id", userId),
    supabase.from("subpendientes").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (notesRes.error) throw notesRes.error;
  if (subPendientesRes.error) throw subPendientesRes.error;

  const projects = {};
  projectsRes.data.forEach((row) => {
    (projects[row.category] || (projects[row.category] = [])).push(rowToProject(row));
  });

  const subPendientes = {};
  subPendientesRes.data.forEach((row) => {
    const sub = rowToSubPendiente(row);
    (subPendientes[sub.pendienteId] || (subPendientes[sub.pendienteId] = [])).push(sub);
  });

  return {
    items: itemsRes.data.map(rowToItem),
    projects,
    notes: notesRes.data.map(rowToNote),
    subPendientes,
  };
}

export async function insertItem(userId, data) {
  const { data: row, error } = await supabase
    .from("pendientes")
    .insert({
      user_id: userId,
      name: data.name,
      category: data.category,
      project_id: data.projectId || null,
      tipificado: data.tipificado,
      anchor_month: data.anchorMonth || null,
      anchor_week: data.anchorWeek || null,
      deadline: data.deadline || null,
      sort_order: data.order ?? 0,
      seed: !!data.seed,
      notes: data.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToItem(row);
}

export async function updateItem(id, patch) {
  const row = {};
  if ("name" in patch) row.name = patch.name;
  if ("category" in patch) row.category = patch.category;
  if ("projectId" in patch) row.project_id = patch.projectId || null;
  if ("tipificado" in patch) row.tipificado = patch.tipificado;
  if ("anchorMonth" in patch) row.anchor_month = patch.anchorMonth || null;
  if ("anchorWeek" in patch) row.anchor_week = patch.anchorWeek || null;
  if ("deadline" in patch) row.deadline = patch.deadline || null;
  if ("order" in patch) row.sort_order = patch.order;
  if ("done" in patch) row.done = patch.done;
  if ("doneAt" in patch) row.done_at = patch.doneAt;
  if ("notes" in patch) row.notes = patch.notes || null;
  const { error } = await supabase.from("pendientes").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id) {
  const { error } = await supabase.from("pendientes").delete().eq("id", id);
  if (error) throw error;
}

export async function updateItemsOrder(updates) {
  await Promise.all(updates.map(({ id, order }) => updateItem(id, { order })));
}

export async function insertSubPendiente(userId, pendienteId, data) {
  const { data: row, error } = await supabase
    .from("subpendientes")
    .insert({ user_id: userId, pendiente_id: pendienteId, name: data.name, notes: data.notes || null })
    .select()
    .single();
  if (error) throw error;
  return rowToSubPendiente(row);
}

export async function updateSubPendiente(id, patch) {
  const row = {};
  if ("name" in patch) row.name = patch.name;
  if ("notes" in patch) row.notes = patch.notes || null;
  const { error } = await supabase.from("subpendientes").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteSubPendiente(id) {
  const { error } = await supabase.from("subpendientes").delete().eq("id", id);
  if (error) throw error;
}

export async function insertProject(userId, categoryId, name) {
  const { data: row, error } = await supabase
    .from("categorias")
    .insert({ user_id: userId, category: categoryId, name })
    .select()
    .single();
  if (error) throw error;
  return rowToProject(row);
}

export async function deleteProject(id) {
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) throw error;
}

export async function insertNote(userId, note) {
  const { data: row, error } = await supabase
    .from("notes")
    .insert({ user_id: userId, text: note.text || "", x: Math.round(note.x), y: Math.round(note.y) })
    .select()
    .single();
  if (error) throw error;
  return rowToNote(row);
}

export async function updateNoteText(id, text) {
  const { error } = await supabase.from("notes").update({ text }).eq("id", id);
  if (error) throw error;
}

export async function updateNotePosition(id, x, y) {
  const { error } = await supabase.from("notes").update({ x: Math.round(x), y: Math.round(y) }).eq("id", id);
  if (error) throw error;
}

export async function updateNoteColor(id, color) {
  const { error } = await supabase.from("notes").update({ color }).eq("id", id);
  if (error) throw error;
}

export async function updateNoteCollapsed(id, collapsed) {
  const { error } = await supabase.from("notes").update({ collapsed }).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

// Reemplaza todo lo que el usuario tiene guardado por lo que trae un
// respaldo .json — se generan ids nuevos porque los del archivo no son
// UUIDs válidos para las columnas de Postgres. Pendientes se insertan uno a
// uno (no en bloque) para quedarse con el id nuevo de cada uno — igual que
// ya se hacía con projectIdByOldId — y así los subpendientes del respaldo
// puedan re-apuntar al pendiente padre correcto en vez de a su id viejo.
export async function replaceAllData(userId, { items, projects, notes, subPendientes }) {
  await supabase.from("pendientes").delete().eq("user_id", userId);
  await supabase.from("categorias").delete().eq("user_id", userId);
  await supabase.from("notes").delete().eq("user_id", userId);

  const projectIdByOldId = {};
  for (const [categoryId, list] of Object.entries(projects || {})) {
    for (const project of list) {
      const row = await insertProject(userId, categoryId, project.name);
      projectIdByOldId[project.id] = row.id;
    }
  }

  const itemIdByOldId = {};
  for (const item of items || []) {
    const row = await insertItem(userId, {
      name: item.name,
      category: item.category,
      projectId: item.projectId ? projectIdByOldId[item.projectId] || null : null,
      tipificado: item.tipificado,
      anchorMonth: item.anchorMonth || null,
      anchorWeek: item.anchorWeek || null,
      deadline: item.deadline || null,
      order: item.order || 0,
      notes: item.notes || null,
    });
    if (item.done) await updateItem(row.id, { done: true, doneAt: item.doneAt || null });
    itemIdByOldId[item.id] = row.id;
  }

  if (notes && notes.length > 0) {
    const rows = notes.map((n) => ({ user_id: userId, text: n.text, x: n.x, y: n.y, color: n.color || null, collapsed: !!n.collapsed }));
    const { error } = await supabase.from("notes").insert(rows);
    if (error) throw error;
  }

  for (const [oldItemId, subs] of Object.entries(subPendientes || {})) {
    const newItemId = itemIdByOldId[oldItemId];
    if (!newItemId) continue;
    for (const sub of subs) {
      await insertSubPendiente(userId, newItemId, { name: sub.name, notes: sub.notes });
    }
  }
}
