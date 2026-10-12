// Colores de categoría/proyecto, elegidos a mano por el usuario, por encima
// del color automático (CATEGORIES[].color, aclarado por capa — ver
// useArbolViewModel.js). Solo UI, igual que el resto de preferencias de
// localStorage de la app: no hay columna "color" en categorias/proyectos en
// Supabase, así que esto vive solo en este navegador.
const KEY = "nn-color-overrides";

export function loadColorOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function saveColorOverrides(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* sin persistencia esta vez */ }
}

export function categoryColorKey(categoryId) { return `category:${categoryId}`; }
export function projectColorKey(projectId) { return `project:${projectId}`; }
