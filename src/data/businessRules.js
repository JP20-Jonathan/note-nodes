// ===========================================================
// Reglas de negocio. El tipificado de un pendiente NUNCA cambia solo: el
// sistema calcula el mes/semana real de forma automática (ver dateUtils.js)
// pero la reasignación de un pendiente a otro tipificado siempre la hace
// la persona, a mano (editando o arrastrando en el Tablero). Lo único
// automático es la detección de atrasados (isOverdue), que es un cálculo
// de solo lectura hecho en cada render, nunca escribe nada.
// ===========================================================
import { addDaysToDateStr } from "./dateUtils.js";
import { getTipificado } from "./tipificados.js";
import { PROJECT_FIELD_BY_CATEGORY } from "./categories.js";

// De qué categoría sale la lista de proyectos/áreas de un pendiente —
// normalmente la misma, salvo Diseño, que usa los proyectos de
// "Proyectos Propios" (ver PROJECT_FIELD_BY_CATEGORY).
export function projectSourceCategory(categoryId) {
  return PROJECT_FIELD_BY_CATEGORY[categoryId]?.sourceCategory || categoryId;
}

export function projectNameFor(projects, item) {
  if (!item.projectId) return null;
  const list = projects[projectSourceCategory(item.category)] || [];
  const p = list.find((x) => x.id === item.projectId);
  return p ? p.name : null;
}

// Dos pendientes ACTIVOS no pueden compartir título — sin esto, un match de
// texto de la Nota Rápida contra el título de un pendiente (ver
// matchQuickNoteTarget) podría ser ambiguo entre 2. Sin mayúsculas ni
// espacios de sobra: "Backend " y "backend" cuentan como el mismo título.
// Uno ya completado no cuenta — reusar su título no es ambiguo, ya no es un
// destino válido para un match.
function normalizeTitle(s) {
  return (s || "").trim().toLowerCase();
}
export function isDuplicateTitle(items, name, excludeId = null) {
  const normalized = normalizeTitle(name);
  if (!normalized) return false;
  return items.some((i) => i.id !== excludeId && !i.done && normalizeTitle(i.name) === normalized);
}

// Nota Rápida: a qué apunta el texto que escribiste — ¿menciona el título de
// un pendiente activo YA EXISTENTE? (la nota se vuelve subpendiente de ese).
// ¿O menciona una categoría, sola o con su proyecto/área pegado con "/"
// (ej. "cesde/frontend")? (la nota se vuelve un pendiente nuevo ahí). Gana
// lo que aparezca MÁS TEMPRANO en el texto (índice más bajo) — no el orden
// en que se revisan los candidatos acá abajo, por eso se comparan los 3
// tipos de candidato por índice en vez de devolver apenas se encuentra el
// primero.
//
// El título de un pendiente nuevo siempre es la primera línea del texto
// (ver splitComposerText en ClipboardComposer.jsx) — si ese título coincide
// exactamente con uno ya existente, SIEMPRE gana acá (índice 0 es el
// mínimo posible), así nunca se llega a crear un pendiente duplicado desde
// la Nota Rápida: en vez de eso, queda como subpendiente del original.
// isDuplicateTitle (arriba) aplica la misma regla donde sí hace falta
// bloquear con un error en vez de resolverlo solo (ItemFormModal, el
// formulario normal de crear/editar).
export function matchQuickNoteTarget(text, { items, categories, projects }) {
  if (!text) return { type: "none" };
  const haystack = text.toLowerCase();
  let best = null;
  function consider(index, candidate) {
    if (index !== -1 && (!best || index < best.index)) best = { index, ...candidate };
  }

  items.filter((i) => !i.done).forEach((item) => {
    if (!item.name) return;
    consider(haystack.indexOf(item.name.toLowerCase()), { type: "pendiente", itemId: item.id });
  });

  categories.forEach((cat) => {
    const catIdx = haystack.indexOf(cat.label.toLowerCase());
    if (catIdx === -1) return;
    const projectField = PROJECT_FIELD_BY_CATEGORY[cat.id];
    if (projectField) {
      const pool = projects[projectField.sourceCategory] || [];
      const afterCat = text.slice(catIdx + cat.label.length);
      const slash = afterCat.match(/^\s*\/\s*/);
      if (slash) {
        const afterSlash = afterCat.slice(slash[0].length).toLowerCase();
        const proj = pool.find((p) => p.name && afterSlash.startsWith(p.name.toLowerCase()));
        if (proj) { consider(catIdx, { type: "category", categoryId: cat.id, projectId: proj.id }); return; }
      }
    }
    consider(catIdx, { type: "category", categoryId: cat.id, projectId: null });
  });

  // Proyecto/área mencionado SOLO, sin el nombre de su categoría antes —
  // igual cuenta, infiere la categoría dueña.
  categories.forEach((cat) => {
    const projectField = PROJECT_FIELD_BY_CATEGORY[cat.id];
    if (!projectField) return;
    const pool = projects[projectField.sourceCategory] || [];
    pool.forEach((proj) => {
      if (!proj.name) return;
      consider(haystack.indexOf(proj.name.toLowerCase()), { type: "category", categoryId: cat.id, projectId: proj.id });
    });
  });

  if (!best) return { type: "none" };
  return { type: best.type, itemId: best.itemId, categoryId: best.categoryId, projectId: best.projectId };
}

// Si un deadline cae dentro de una semana dada (lunes a domingo, 7 días
// desde weekStart) — se usa para que el glow/resaltado de "esta semana" o
// "próxima semana" en el Árbol también atrape pendientes que tienen esa
// fecha límite aunque su tipificado sea otro (ej. "importantísimas" con
// vencimiento esta semana), no solo los que están tipificados así.
export function isDueInWeek(deadline, weekStart) {
  if (!deadline || !weekStart) return false;
  return deadline >= weekStart && deadline <= addDaysToDateStr(weekStart, 6);
}

// Un pendiente está atrasado cuando el período al que está anclado
// (anchorMonth para los tipificados de mes, anchorWeek para los de semana)
// ya quedó en el pasado. Aplica igual a "este mes"/"esta semana" que a
// "próximo mes"/"próxima semana": si su período ya llegó y pasó sin que
// alguien lo reasigne a mano, también cuenta como atrasado.
export function isOverdue(item, currentMonthKey, currentWeekStart) {
  if (item.done) return false;
  const scope = getTipificado(item.tipificado).scope;
  if (scope === "month") return !!item.anchorMonth && item.anchorMonth < currentMonthKey;
  if (scope === "week") return !!item.anchorWeek && item.anchorWeek < currentWeekStart;
  return false;
}

// Ancla (anchorMonth/anchorWeek) que le corresponde a un tipificado hoy —
// se usa tanto al crear/editar (ItemFormModal) como al reasignar por
// arrastre en el Tablero (App.jsx), para no duplicar esta tabla en los dos.
export function anchorFor(tipificadoId, { currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart }) {
  if (tipificadoId === "este_mes") return { anchorMonth: currentMonthKey, anchorWeek: null };
  if (tipificadoId === "proximo_mes") return { anchorMonth: nextMonthKey, anchorWeek: null };
  if (tipificadoId === "esta_semana" || tipificadoId === "en_curso") return { anchorMonth: null, anchorWeek: currentWeekStart };
  if (tipificadoId === "proxima_semana") return { anchorMonth: null, anchorWeek: nextWeekStart };
  return { anchorMonth: null, anchorWeek: null };
}

export function countActiveForCap(items, { category, projectId, tipificado, anchorMonth, anchorWeek, excludeId }) {
  return items.filter((i) => {
    if (i.id === excludeId) return false;
    if (i.done) return false;
    if (i.category !== category) return false;
    if ((projectId || null) !== (i.projectId || null)) return false;
    if (i.tipificado !== tipificado) return false;
    if (anchorMonth && i.anchorMonth !== anchorMonth) return false;
    if (anchorWeek && i.anchorWeek !== anchorWeek) return false;
    return true;
  }).length;
}

// "venció" si la fecha ya pasó, "vence" si es hoy o todavía no llega —
// decir "vence 26 sep" de algo que pasó hace rato no es lógico.
export function deadlineVerb(deadline, todayStr) {
  return deadline < todayStr ? "venció" : "vence";
}

export function deadlineChipClass(deadline, todayStr) {
  if (!deadline) return "badge chip";
  if (deadline <= todayStr) return "badge chip deadline-soon";
  const inFive = addDaysToDateStr(todayStr, 5);
  if (deadline <= inFive) return "badge chip deadline-week";
  return "badge chip deadline-far";
}
