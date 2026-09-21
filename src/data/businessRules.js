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
  if (tipificadoId === "esta_semana" || tipificadoId === "siguientes_actividades") return { anchorMonth: null, anchorWeek: currentWeekStart };
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

export function deadlineChipClass(deadline, todayStr) {
  if (!deadline) return "badge chip";
  if (deadline <= todayStr) return "badge chip deadline-soon";
  const inFive = addDaysToDateStr(todayStr, 5);
  if (deadline <= inFive) return "badge chip deadline-week";
  return "badge chip deadline-far";
}
