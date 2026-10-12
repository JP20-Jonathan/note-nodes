// ===========================================================
// useArbolViewModel — capa de datos para el grafo del Árbol (D3)
// ===========================================================
// Transforma items/projects/categorías en una lista plana de
// nodos + enlaces, ya lista para que un motor de dibujo (D3 u
// otro) la consuma. No importa nada de D3, no toca el DOM y no
// usa JSX: es una función de datos, igual de pura en espíritu
// que isOverdue, aunque no vive en businessRules.js
// porque pertenece conceptualmente al Árbol, no al modelo de
// negocio. Las funciones de negocio (isOverdue) solo se LEEN
// aquí, nunca se modifican.
import { useMemo } from "react";
import { CATEGORIES, lightenHex } from "../data/categories.js";
import { isOverdue, isDueInWeek, projectSourceCategory } from "../data/businessRules.js";
import { categoryColorKey, projectColorKey } from "../data/colorOverrides.js";

// Cuánto se aclara el color de la categoría en cada capa hacia adentro —
// la categoría misma usa su color base (el más intenso); un pendiente
// directo (sin proyecto) o un proyecto quedan un escalón más claros; un
// pendiente dentro de un proyecto, dos escalones (así nunca se ve idéntico
// a su categoría ni a su proyecto, sin importar cuántas capas haya).
const LIGHTEN_STEP = 0.35;

function buildItemNode(id, item, color, parentId, currentMonthKey, currentWeekStart, nextWeekStart) {
  return {
    id,
    type: "item",
    parentId,
    itemId: item.id,
    categoryId: item.category,
    projectId: item.projectId || null,
    label: item.name,
    color,
    emoji: "✦",
    radius: 10,
    meta: {
      tipificado: item.tipificado,
      deadline: item.deadline,
      overdue: isOverdue(item, currentMonthKey, currentWeekStart),
      dueThisWeek: isDueInWeek(item.deadline, currentWeekStart),
      dueNextWeek: isDueInWeek(item.deadline, nextWeekStart),
    },
  };
}

// Subpendientes del item — un escalón más claros que el color YA resuelto
// del item (no el de su padre), misma regla de "cada capa hacia adentro se
// aclara un poco más" que ya aplica entre categoría/proyecto/item. itemId
// (el id REAL del pendiente padre, no el compuesto del nodo) viaja en cada
// subnodo para que ForceGraph/App.jsx puedan abrir el mismo
// ItemDetailPopover del padre al tocar uno — un subpendiente no tiene
// detalle propio, solo nombre y nota (ver SubPendienteForm.jsx).
function buildSubPendienteNodes(item, itemNodeId, itemColor, subPendientesByItemId) {
  const subs = subPendientesByItemId[item.id];
  if (!subs || subs.length === 0) return { nodes: [], links: [] };
  const color = lightenHex(itemColor, LIGHTEN_STEP);
  const nodes = subs.map((sub) => ({
    id: `subpendiente:${sub.id}`,
    type: "subpendiente",
    parentId: itemNodeId,
    itemId: item.id,
    subPendienteId: sub.id,
    categoryId: item.category,
    projectId: item.projectId || null,
    label: sub.name,
    color,
    emoji: "▫",
    radius: 5,
    meta: { notes: sub.notes },
  }));
  const links = nodes.map((n) => ({ source: itemNodeId, target: n.id }));
  return { nodes, links };
}

// Agrega el nodo de un item, su link al padre, y sus subpendientes (si
// tiene) — centralizado para no repetir las 3 líneas en los dos lugares
// que recorren items (proyectos y directos de categoría, más abajo).
function pushItemAndSubs(nodes, links, item, itemNodeId, itemColor, parentNodeId, subPendientesByItemId, currentMonthKey, currentWeekStart, nextWeekStart) {
  nodes.push(buildItemNode(itemNodeId, item, itemColor, parentNodeId, currentMonthKey, currentWeekStart, nextWeekStart));
  links.push({ source: parentNodeId, target: itemNodeId });
  const subs = buildSubPendienteNodes(item, itemNodeId, itemColor, subPendientesByItemId);
  nodes.push(...subs.nodes);
  links.push(...subs.links);
}

/* Hook principal: dado el estado de datos actual, devuelve
   { nodes, links, byId } listos para un force-directed graph.
   - nodes: lista plana, cada uno con id/type/parentId/label/
     color/emoji/radius/meta — nunca JSX, nunca un nodo del DOM.
   - links: pares { source, target } con los mismos ids que los
     nodos, en el formato que D3 (forceLink) espera directamente.
   - byId: mismo contenido que nodes, indexado por id, para
     lookups rápidos (ej. abrir el detalle de un item por id)
     sin recorrer el array. */
export function useArbolViewModel(items, projects, currentMonthKey, currentWeekStart, nextWeekStart, colorOverrides, subPendientes) {
  return useMemo(() => {
    const overrides = colorOverrides || {};
    const subPendientesByItemId = subPendientes || {};
    const nodes = [];
    const links = [];
    const activeItems = items.filter((i) => !i.done);

    const SUN_ID = "sun";
    // weekCount alimenta el color/titileo del sol en ForceGraph: cuántos
    // pendientes de "esta semana" hay activos ahora mismo — es la señal de
    // "¿preparé mi semana o no?", independiente del total general (activeCount).
    const weekCount = activeItems.filter((i) => i.tipificado === "esta_semana").length;
    nodes.push({
      id: SUN_ID,
      type: "sun",
      parentId: null,
      label: "Pendientes",
      color: "#F5D67B",
      emoji: "☀️",
      radius: 42,
      meta: { activeCount: activeItems.length, weekCount },
    });

    CATEGORIES.forEach((cat) => {
      const catNodeId = `category:${cat.id}`;
      // Diseño toma prestada la lista de proyectos de "Proyectos Propios"
      // (ver PROJECT_FIELD_BY_CATEGORY): el pool de dónde salen las opciones
      // no siempre es la categoría misma. Para que el árbol cuelgue cada
      // pendiente de SU categoría real (no de la categoría dueña del
      // proyecto), filtramos cada proyecto por item.category además de
      // projectId, y solo mostramos el nodo de un proyecto "prestado" si de
      // verdad tiene pendientes de esta categoría — si no, no aparece.
      const sourceCategory = projectSourceCategory(cat.id);
      const isNativeOwner = sourceCategory === cat.id;
      const projectPool = projects[sourceCategory] || [];
      const directItems = activeItems.filter((i) => i.category === cat.id && !i.projectId);
      const visibleProjects = projectPool
        .map((project) => ({ project, projItems: activeItems.filter((i) => i.projectId === project.id && i.category === cat.id) }))
        .filter(({ projItems }) => isNativeOwner || projItems.length > 0);

      // Color base de la categoría: el elegido a mano por el usuario (ver
      // ColorControllerModal) si existe, si no el automático de CATEGORIES.
      const catColor = overrides[categoryColorKey(cat.id)] || cat.color;

      nodes.push({
        id: catNodeId,
        type: "category",
        parentId: SUN_ID,
        categoryId: cat.id,
        label: cat.label,
        color: catColor,
        emoji: cat.emoji,
        radius: 30,
        meta: {
          activeCount: activeItems.filter((i) => i.category === cat.id).length,
          hasProjects: visibleProjects.length > 0,
        },
      });
      links.push({ source: SUN_ID, target: catNodeId });

      visibleProjects.forEach(({ project, projItems }) => {
        // Id compuesto solo para proyectos "prestados" (Diseño): el mismo
        // proyecto puede colgar a la vez de su categoría dueña (con sus
        // propios items) y de Diseño (con los suyos), sin que ambos nodos
        // choquen de id.
        const projNodeId = isNativeOwner ? `project:${project.id}` : `project:${cat.id}:${project.id}`;
        // Mismo criterio que la categoría: override elegido a mano, si no el
        // automático (aclarado un escalón desde el color YA resuelto de la
        // categoría, para que un override de categoría se herede también acá).
        const projColor = overrides[projectColorKey(project.id)] || lightenHex(catColor, LIGHTEN_STEP);

        nodes.push({
          id: projNodeId,
          type: "project",
          parentId: catNodeId,
          categoryId: cat.id,
          projectId: project.id,
          label: project.name,
          color: projColor,
          emoji: "📁",
          radius: 20,
          meta: { activeCount: projItems.length },
        });
        links.push({ source: catNodeId, target: projNodeId });

        projItems.forEach((item) => {
          const itemNodeId = `item:${item.id}`;
          // Un escalón más claro que el color YA resuelto del proyecto (no
          // el de la categoría): si el usuario le puso un color propio al
          // proyecto, sus items se notan de ese color, no del de la categoría.
          pushItemAndSubs(nodes, links, item, itemNodeId, lightenHex(projColor, LIGHTEN_STEP), projNodeId, subPendientesByItemId, currentMonthKey, currentWeekStart, nextWeekStart);
        });
      });

      directItems.forEach((item) => {
        const itemNodeId = `item:${item.id}`;
        pushItemAndSubs(nodes, links, item, itemNodeId, lightenHex(catColor, LIGHTEN_STEP), catNodeId, subPendientesByItemId, currentMonthKey, currentWeekStart, nextWeekStart);
      });
    });

    const byId = {};
    nodes.forEach((n) => { byId[n.id] = n; });

    return { nodes, links, byId };
  }, [items, projects, currentMonthKey, currentWeekStart, nextWeekStart, colorOverrides, subPendientes]);
}
