import { useCallback, useState } from "react";

// Tipo de dataTransfer propio para arrastrar una COLUMNA entera (a
// diferencia de "text/plain", que ya se usa para arrastrar una tarjeta/
// pendiente) — así un drop puede distinguir sin ambigüedad cuál de los dos
// gestos fue.
export const COLUMN_DRAG_TYPE = "application/x-tabcol";

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

function loadExpanded(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(`pnd-expanded-${key}`) || "[]");
    return Array.isArray(saved) ? new Set(saved) : new Set();
  } catch (e) {
    return new Set();
  }
}

// Recuerda, por navegador, en qué orden puso el usuario las columnas de un
// tablero y cuáles dejó expandidas — sobrevive a recargar la página Y a
// cambiar de pestaña/vista (antes "expandir" era estado local del
// componente, así que se perdía apenas la columna se desmontaba; ahora vive
// acá, igual que el orden, para que se comporte como las notas/indicadores/
// colores: queda como el usuario lo dejó).
export function useColumnLayout(storageKey, ids) {
  const [order, setOrder] = useState(() => loadOrder(storageKey, ids));
  const [expanded, setExpanded] = useState(() => loadExpanded(storageKey));

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

  const toggleExpanded = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(`pnd-expanded-${storageKey}`, JSON.stringify([...next])); } catch (e) { /* sin persistencia esta vez */ }
      return next;
    });
  }, [storageKey]);

  const isExpanded = useCallback((id) => expanded.has(id), [expanded]);

  return { order, moveColumn, isExpanded, toggleExpanded };
}
