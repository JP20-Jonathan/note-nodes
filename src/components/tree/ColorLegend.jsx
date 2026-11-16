import { useEffect, useRef } from "react";
import { isOverdue } from "../../data/businessRules.js";
import { useDraggablePosition } from "../../hooks/useDraggablePosition.js";

const POS_KEY = "nn-legend-pos";
function loadPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;
  } catch (e) { /* localStorage no disponible o dato corrupto */ }
  return null;
}

// Letrero flotante (sin fondo, a propósito — se integra con el grafo en vez
// de tapar nodos) que explica qué significa cada color/glow Y, de paso,
// cuántos pendientes activos hay en cada uno — así no hay que repetir el
// mismo número en dos paneles distintos (antes vivía también en
// IndicatorsPanel). Tiene que reflejar los mismos casos/orden que
// itemGlowStyle en ForceGraph.jsx.
const LEGEND_ITEMS = [
  { id: "atrasado", color: "var(--glow-urgent-red)", pulse: true, label: "Atrasado" },
  { id: "urgentes", color: "var(--glow-urgent-red)", pulse: false, label: "Urgente" },
  { id: "importantisimas", color: "var(--accent)", pulse: false, label: "Importante" },
  // Antes vivía en IndicatorsPanel (count + checkbox de "Resaltar en el
  // Árbol") — se mudó acá entero: incluirla en LEGEND_ITEMS ya le da conteo
  // Y filtro con el mismo toque que cualquier otro color (ver ColorLegend
  // más abajo), así que el checkbox aparte quedaba duplicado.
  { id: "proxima_semana", color: "var(--sema-yellow)", pulse: true, label: "Próxima semana" },
  { id: "esta_semana", color: "var(--glow-active-green)", pulse: true, label: "Esta semana" },
  { id: "en_curso", color: "var(--glow-active-green)", pulse: true, label: "En curso" },
];

export function ColorLegend({ items, currentMonthKey, currentWeekStart, defaultPos, canvasBounds, hideWhenOutside, tipificadoFilter, onToggleFilter }) {
  const userMovedRef = useRef(loadPos() !== null);
  const { pos, setPos, handleMouseDown } = useDraggablePosition(
    loadPos() || defaultPos || { x: 10, y: 10 },
    (x, y) => { userMovedRef.current = true; try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch (e) { /* sin persistencia esta vez */ } },
  );
  useEffect(() => { if (!userMovedRef.current && defaultPos) setPos(defaultPos); }, [defaultPos, setPos]);

  // Mismo criterio que IndicatorsPanel: fuera del lienzo + pantalla
  // completa = oculto, porque en pantalla completa ya no hay "fuera". Solo
  // aplica si el usuario lo arrastró a mano — la posición por defecto sigue
  // la esquina del lienzo incluso expandido (ver efecto de arriba), así que
  // nunca cuenta como "afuera" aunque quede más allá del tamaño congelado.
  const isOutsideCanvas = userMovedRef.current && canvasBounds && (pos.x >= canvasBounds.width || pos.y >= canvasBounds.height);
  if (hideWhenOutside && isOutsideCanvas) return null;

  const activeItems = items.filter((i) => !i.done);
  function countFor(id) {
    if (id === "atrasado") return activeItems.filter((i) => isOverdue(i, currentMonthKey, currentWeekStart)).length;
    return activeItems.filter((i) => i.tipificado === id).length;
  }

  // Mismo Set/toggle que ya usa "Resaltar en el Árbol" en IndicatorsPanel
  // (onToggleFilter agrega/quita el id del mismo tipificadoFilter) — acá no
  // hay checkbox, el renglón entero es el control: un toque lo prende, otro
  // lo apaga. Con algo seleccionado, el resto de los colores se opacan un
  // poco para que sea obvio cuál está resaltado en el grafo ahora mismo.
  const hasSelection = tipificadoFilter && tipificadoFilter.size > 0;

  return (
    <div className="color-legend draggable-float" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      {LEGEND_ITEMS.map((it) => {
        const active = tipificadoFilter && tipificadoFilter.has(it.id);
        return (
          <button
            type="button"
            key={it.label}
            className={`color-legend-row${active ? " color-legend-row-active" : ""}${hasSelection && !active ? " color-legend-row-dim" : ""}`}
            onClick={() => onToggleFilter && onToggleFilter(it.id)}
          >
            <span
              className={`color-legend-dot${it.pulse ? " color-legend-dot-pulse" : ""}`}
              style={{ background: it.color, boxShadow: `0 0 4px ${it.color}` }}
            />
            {it.label}: <strong>{countFor(it.id)}</strong>
          </button>
        );
      })}
    </div>
  );
}
