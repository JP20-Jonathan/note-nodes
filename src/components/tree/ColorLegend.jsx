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
  { id: "importantisimas", color: "var(--accent)", pulse: false, label: "Importantísima" },
  { id: "esta_semana", color: "var(--glow-active-green)", pulse: true, label: "Esta semana" },
  { id: "en_curso", color: "var(--glow-active-green)", pulse: true, label: "En curso" },
];

export function ColorLegend({ items, currentMonthKey, currentWeekStart, defaultPos, canvasBounds, hideWhenOutside }) {
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

  return (
    <div className="color-legend draggable-float" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      <div className="color-legend-title">Colores</div>
      {LEGEND_ITEMS.map((it) => (
        <div key={it.label} className="color-legend-row">
          <span
            className={`color-legend-dot${it.pulse ? " color-legend-dot-pulse" : ""}`}
            style={{ background: it.color, boxShadow: `0 0 4px ${it.color}` }}
          />
          {it.label}: <strong>{countFor(it.id)}</strong>
        </div>
      ))}
    </div>
  );
}
