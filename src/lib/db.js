// Capa de acceso a datos sobre Supabase (tablas items/projects/notes,
// una fila por registro, con RLS por user_id). Traduce entre las columnas
// de la base (snake_case, project_id/anchor_month/sort_order) y la forma
// que ya espera el resto de la app (camelCase, projects agrupados por
// categoría) para no tener que tocar businessRules.js/useArbolViewModel.
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
    seed: row.seed,
    notes: row.notes || "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToProject(row) {
  return { id: row.id, name: row.name, seed: row.seed };
}

function rowToNote(row) {
  return { id: row.id, text: row.text, x: row.x, y: row.y, seed: row.seed };
}

export async function fetchAllData(userId) {
  const [itemsRes, projectsRes, notesRes] = await Promise.all([
    supabase.from("items").select("*").eq("user_id", userId).order("sort_order", { ascending: true }),
    supabase.from("projects").select("*").eq("user_id", userId),
    supabase.from("notes").select("*").eq("user_id", userId),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (notesRes.error) throw notesRes.error;

  const projects = {};
  projectsRes.data.forEach((row) => {
    (projects[row.category] || (projects[row.category] = [])).push(rowToProject(row));
  });

  return {
    items: itemsRes.data.map(rowToItem),
    projects,
    notes: notesRes.data.map(rowToNote),
  };
}

export async function insertItem(userId, data) {
  const { data: row, error } = await supabase
    .from("items")
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
  if ("notes" in patch) row.notes = patch.notes || null;
  const { error } = await supabase.from("items").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

export async function updateItemsOrder(updates) {
  await Promise.all(updates.map(({ id, order }) => updateItem(id, { order })));
}

export async function insertProject(userId, categoryId, name) {
  const { data: row, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, category: categoryId, name })
    .select()
    .single();
  if (error) throw error;
  return rowToProject(row);
}

export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
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

export async function deleteNote(id) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

// ---- Operaciones masivas: datos de prueba e importar/exportar respaldo ----

export async function bulkInsertTestData(userId, { items, seedProjects, notes }) {
  const projectIdByPlaceholder = {};
  for (const [categoryId, list] of Object.entries(seedProjects)) {
    for (const project of list) {
      const row = await insertProject(userId, categoryId, project.name);
      projectIdByPlaceholder[project.id] = row.id;
      await supabase.from("projects").update({ seed: true }).eq("id", row.id);
    }
  }

  if (items.length > 0) {
    const rows = items.map((item) => ({
      user_id: userId,
      name: item.name,
      category: item.category,
      project_id: item.projectId ? projectIdByPlaceholder[item.projectId] || null : null,
      tipificado: item.tipificado,
      anchor_month: item.anchorMonth || null,
      anchor_week: item.anchorWeek || null,
      deadline: item.deadline || null,
      sort_order: item.order || 0,
      seed: true,
    }));
    const { error } = await supabase.from("items").insert(rows);
    if (error) throw error;
  }

  if (notes.length > 0) {
    const rows = notes.map((n) => ({ user_id: userId, text: n.text, x: n.x, y: n.y, seed: true }));
    const { error } = await supabase.from("notes").insert(rows);
    if (error) throw error;
  }
}

export async function deleteSeedData(userId) {
  await supabase.from("items").delete().eq("user_id", userId).eq("seed", true);
  await supabase.from("projects").delete().eq("user_id", userId).eq("seed", true);
  await supabase.from("notes").delete().eq("user_id", userId).eq("seed", true);
}

// Reemplaza todo lo que el usuario tiene guardado por lo que trae un
// respaldo .json — se generan ids nuevos porque los del archivo no son
// UUIDs válidos para las columnas de Postgres.
export async function replaceAllData(userId, { items, projects, notes }) {
  await supabase.from("items").delete().eq("user_id", userId);
  await supabase.from("projects").delete().eq("user_id", userId);
  await supabase.from("notes").delete().eq("user_id", userId);

  const projectIdByOldId = {};
  for (const [categoryId, list] of Object.entries(projects || {})) {
    for (const project of list) {
      const row = await insertProject(userId, categoryId, project.name);
      projectIdByOldId[project.id] = row.id;
    }
  }

  if (items && items.length > 0) {
    const rows = items.map((item) => ({
      user_id: userId,
      name: item.name,
      category: item.category,
      project_id: item.projectId ? projectIdByOldId[item.projectId] || null : null,
      tipificado: item.tipificado,
      anchor_month: item.anchorMonth || null,
      anchor_week: item.anchorWeek || null,
      deadline: item.deadline || null,
      sort_order: item.order || 0,
      done: !!item.done,
    }));
    const { error } = await supabase.from("items").insert(rows);
    if (error) throw error;
  }

  if (notes && notes.length > 0) {
    const rows = notes.map((n) => ({ user_id: userId, text: n.text, x: n.x, y: n.y }));
    const { error } = await supabase.from("notes").insert(rows);
    if (error) throw error;
  }
}
