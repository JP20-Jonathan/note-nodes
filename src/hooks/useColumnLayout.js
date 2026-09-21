import { useCallback, useState } from "react";

// Tipo de dataTransfer propio para arrastrar una COLUMNA entera (a
// diferencia de "text/plain", que ya se usa para arrastrar una tarjeta/
// pendiente) — así un drop puede distinguir sin ambigüedad cuál de los dos
// gestos fue.
export const COLUMN_DRAG_TYPE = "application/x-tabcol";

const SIZES = ["medium", "large"];
const SIZE_LABEL = { medium: "M", large: "L" };
export function sizeLabel(size) { return SIZE_LABEL[size] || "M"; }

function loadOrder(key, ids) {
  try {
    const saved = JSON.parse(localStorage.getItem(`pnd-order-${key}`) || "null");
    if (Array.isArray(saved)) {
      const known = new Set(ids);
      const kept = saved.filter((id) => known.has(id));
      const missing = ids.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    }
  } catch (e) { /* localStorage no disponible o dato corrupto: se usa el orden por defecto */ }
  return ids;
}

function loadSizes(key) {
  try {
    return JSON.parse(localStorage.getItem(`pnd-size-${key}`) || "{}");
  } catch (e) {
    return {};
  }
}

// Recuerda, por navegador, en qué orden puso el usuario las columnas de un
// tablero y qué tamaño eligió para cada una — sobrevive a recargar la
// página. No es un layout libre en píxeles (eso sería mucho más trabajo,
// con una librería de grillas arrastrables); aquí solo se reordena entre
// columnas del mismo grupo y se elige entre 3 tamaños fijos.
export function useColumnLayout(storageKey, ids) {
  const [order, setOrder] = useState(() => loadOrder(storageKey, ids));
  const [sizes, setSizes] = useState(() => loadSizes(storageKey));

  const moveColumn = useCallback((draggedId, targetId) => {
    if (draggedId === targetId) return;
    setOrder((prev) => {
      const fromIdx = prev.indexOf(draggedId);
      const toIdx = prev.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = prev.filter((id) => id !== draggedId);
      next.splice(toIdx, 0, draggedId);
      try { localStorage.setItem(`pnd-order-${storageKey}`, JSON.stringify(next)); } catch (e) { /* sin persistencia esta vez */ }
      return next;
    });
  }, [storageKey]);

  const cycleSize = useCallback((id) => {
    setSizes((prev) => {
      const current = prev[id] || "medium";
      const next = SIZES[(SIZES.indexOf(current) + 1) % SIZES.length];
      const updated = { ...prev, [id]: next };
      try { localStorage.setItem(`pnd-size-${storageKey}`, JSON.stringify(updated)); } catch (e) { /* sin persistencia esta vez */ }
      return updated;
    });
  }, [storageKey]);

  const sizeOf = useCallback((id) => (SIZES.includes(sizes[id]) ? sizes[id] : "medium"), [sizes]);

  return { order, moveColumn, sizeOf, cycleSize };
}
