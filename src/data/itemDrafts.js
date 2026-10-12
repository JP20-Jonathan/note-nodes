// Borradores de "nuevo pendiente" sin terminar — viven solo en localStorage
// (nunca en la base de datos, se pierden si cambiás de navegador, y eso está
// bien: son texto a medio escribir, no un pendiente real todavía). Se
// guardan por nodo (categoría, o categoría+proyecto) para poder tener uno
// sin terminar por cada rama del árbol a la vez, cada uno con su propio id
// — así dos borradores en el MISMO nodo nunca se pisan entre sí.
import { uid } from "./dateUtils.js";

const STORAGE_KEY = "nn-item-drafts";

function loadAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) { return {}; }
}
function saveAll(all) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) { /* sin persistencia esta vez */ }
}

export function draftNodeKey(categoryId, projectId) {
  return `${categoryId}:${projectId || "none"}`;
}

export function listDrafts(nodeKey) {
  return loadAll()[nodeKey] || [];
}

// draft trae su propio `id` (generado una vez, al crear el primer campo no
// vacío del formulario — ver ItemFormModal) — si ya existe en la lista se
// reemplaza en el lugar, si no se agrega.
export function saveDraft(nodeKey, draft) {
  const all = loadAll();
  const list = all[nodeKey] ? all[nodeKey].slice() : [];
  const idx = list.findIndex((d) => d.id === draft.id);
  if (idx === -1) list.push(draft); else list[idx] = draft;
  all[nodeKey] = list;
  saveAll(all);
}

export function discardDraft(nodeKey, draftId) {
  const all = loadAll();
  if (!all[nodeKey]) return;
  const next = all[nodeKey].filter((d) => d.id !== draftId);
  if (next.length === 0) delete all[nodeKey];
  else all[nodeKey] = next;
  saveAll(all);
}

export function newDraftId() { return uid(); }
