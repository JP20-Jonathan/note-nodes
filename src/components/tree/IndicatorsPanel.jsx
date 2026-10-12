import { useEffect, useRef } from "react";
import { TIPIFICADO_ICON, getTipificado } from "../../data/tipificados.js";
import { useDraggablePosition } from "../../hooks/useDraggablePosition.js";

const POS_KEY = "nn-indicators-pos";
function loadPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;
  } catch (e) { /* localStorage no disponible o dato corrupto */ }
  return null;
}

// Panel flotante (sin fondo — se integra con el grafo) con totales
// generales + conteos de los tipificados que todavía no tienen su propio
// color en ColorLegend.jsx (urgentes/importantísimas/esta_semana/en_curso
// ya se fusionaron ahí, con su número al lado del color). Los checkboxes
// filtran/resaltan esos tipificados directamente en el grafo (ver
// tipificadoFilter en ForceGraph) — no se persisten a propósito, es una
// exploración puntual de la sesión, no algo que tenga sentido recordar.
const INDICATOR_IDS = ["proxima_semana", "este_mes", "proximo_mes"];
const FILTER_IDS = ["esta_semana", "proxima_semana", "este_mes", "proximo_mes"];

export function IndicatorsPanel({ items, projects, notes, tipificadoFilter, onToggleFilter, defaultPos, canvasBounds, hideWhenOutside }) {
  const userMovedRef = useRef(loadPos() !== null);
  const { pos, setPos, handleMouseDown } = useDraggablePosition(
    loadPos() || defaultPos || { x: 10, y: 10 },
    (x, y) => { userMovedRef.current = true; try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch (e) { /* sin persistencia esta vez */ } },
  );
  // Si el usuario nunca lo arrastró, sigue el lienzo cuando cambia de tamaño
  // (resize, pantalla completa) — en cuanto lo arrastra una vez, deja de
  // seguir el default para siempre (ver userMovedRef).
  useEffect(() => { if (!userMovedRef.current && defaultPos) setPos(defaultPos); }, [defaultPos, setPos]);

  // Si lo arrastraron fuera del lienzo (al fondo sin usar) y estamos en
  // pantalla completa, ese fondo ya no existe — el lienzo pasa a ocupar
  // toda la ventana — así que en vez de aparecer encimado en medio del
  // grafo, se oculta: "fuera" sigue significando fuera de la vista. Solo
  // aplica si lo arrastró a mano (userMovedRef) — la posición por defecto
  // sigue la esquina del lienzo incluso expandido, así que nunca cuenta
  // como "afuera" aunque quede más allá del tamaño congelado.
  const isOutsideCanvas = userMovedRef.current && canvasBounds && (pos.x >= canvasBounds.width || pos.y >= canvasBounds.height);
  if (hideWhenOutside && isOutsideCanvas) return null;

  const activeItems = items.filter((i) => !i.done);
  const countFor = (tipId) => activeItems.filter((i) => i.tipificado === tipId).length;
  const totalProjects = Object.values(projects).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="indicators-panel draggable-float" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      <div className="indicators-totals">
        <span><strong>{items.length}</strong> pendientes</span>
        <span><strong>{totalProjects}</strong> proyectos</span>
        <span><strong>{notes.length}</strong> notas</span>
      </div>
      <div className="indicators-list">
        {INDICATOR_IDS.map((id) => (
          <span key={id} className="indicator-count">
            {TIPIFICADO_ICON[id] || ""} {getTipificado(id).label}: <strong>{countFor(id)}</strong>
          </span>
        ))}
      </div>
      <div className="indicators-filters">
        <div className="indicators-filters-label">Resaltar en el Árbol</div>
        {FILTER_IDS.map((id) => (
          <label key={id} className="indicator-filter-checkbox">
            <input
              type="checkbox"
              checked={tipificadoFilter.has(id)}
              onChange={() => onToggleFilter(id)}
            />
            {getTipificado(id).label}
          </label>
        ))}
      </div>
    </div>
  );
}
