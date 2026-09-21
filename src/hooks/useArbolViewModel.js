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
import { isOverdue } from "../data/businessRules.js";

// Cuánto se aclara el color de la categoría en cada capa hacia adentro —
// la categoría misma usa su color base (el más intenso); un pendiente
// directo (sin proyecto) o un proyecto quedan un escalón más claros; un
// pendiente dentro de un proyecto, dos escalones (así nunca se ve idéntico
// a su categoría ni a su proyecto, sin importar cuántas capas haya).
const LIGHTEN_STEP = 0.35;

function buildItemNode(id, item, color, parentId, currentMonthKey, currentWeekStart) {
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
    },
  };
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
export function useArbolViewModel(items, projects, currentMonthKey, currentWeekStart) {
  return useMemo(() => {
    const nodes = [];
    const links = [];
    const activeItems = items.filter((i) => !i.done);

    const SUN_ID = "sun";
    nodes.push({
      id: SUN_ID,
      type: "sun",
      parentId: null,
      label: "Pendientes",
      color: "#F5D67B",
      emoji: "☀️",
      radius: 42,
      meta: { activeCount: activeItems.length },
    });

    CATEGORIES.forEach((cat) => {
      const catNodeId = `category:${cat.id}`;
      const projectList = projects[cat.id] || [];
      const directItems = activeItems.filter((i) => i.category === cat.id && !i.projectId);

      nodes.push({
        id: catNodeId,
        type: "category",
        parentId: SUN_ID,
        categoryId: cat.id,
        label: cat.label,
        color: cat.color,
        emoji: cat.emoji,
        radius: 30,
        meta: {
          activeCount: activeItems.filter((i) => i.category === cat.id).length,
          hasProjects: projectList.length > 0,
        },
      });
      links.push({ source: SUN_ID, target: catNodeId });

      projectList.forEach((project) => {
        const projNodeId = `project:${project.id}`;
        const projItems = activeItems.filter((i) => i.projectId === project.id);

        nodes.push({
          id: projNodeId,
          type: "project",
          parentId: catNodeId,
          categoryId: cat.id,
          projectId: project.id,
          label: project.name,
          color: lightenHex(cat.color, LIGHTEN_STEP),
          emoji: "📁",
          radius: 20,
          meta: { activeCount: projItems.length },
        });
        links.push({ source: catNodeId, target: projNodeId });

        projItems.forEach((item) => {
          const itemNodeId = `item:${item.id}`;
          nodes.push(buildItemNode(itemNodeId, item, lightenHex(cat.color, LIGHTEN_STEP * 2), projNodeId, currentMonthKey, currentWeekStart));
          links.push({ source: projNodeId, target: itemNodeId });
        });
      });

      directItems.forEach((item) => {
        const itemNodeId = `item:${item.id}`;
        nodes.push(buildItemNode(itemNodeId, item, lightenHex(cat.color, LIGHTEN_STEP), catNodeId, currentMonthKey, currentWeekStart));
        links.push({ source: catNodeId, target: itemNodeId });
      });
    });

    const byId = {};
    nodes.forEach((n) => { byId[n.id] = n; });

    return { nodes, links, byId };
  }, [items, projects, currentMonthKey, currentWeekStart]);
}
