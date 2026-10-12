import { getCategory } from "../../data/categories.js";
import { getTipificado } from "../../data/tipificados.js";
import { projectNameFor } from "../../data/businessRules.js";
import { MONTH_NAMES } from "../../data/dateUtils.js";

// "Cuándo se completó" en texto corto, en hora de Medellín — mismo huso que
// usa el resto de la app (ver todayInMedellin en dateUtils.js). doneAt es
// un timestamp en ms (ver rowToItem en db.js); items marcados hechos antes
// de la migración de done_at llegan con doneAt=null, por eso el fallback.
function formatDoneAt(doneAt) {
  if (!doneAt) return "Fecha no registrada";
  const d = new Date(doneAt);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  const month = MONTH_NAMES[Number(map.month) - 1].slice(0, 3);
  return `${Number(map.day)} ${month}, ${map.hour}:${map.minute}`;
}

// Historial de pendientes marcados como hechos — no se borran al completarse
// (ver toggleDone en App.jsx), solo se ocultan del Árbol/Tablero; este modal
// es la única forma de volver a verlos y, si hizo falta, revertirlos.
export function CompletedItemsModal({ items, projects, onRevert, onClose }) {
  const completed = items
    .filter((i) => i.done)
    .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pnd-modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <h3 className="pnd-serif" style={{ margin: 0, fontSize: 16 }}>Completados ({completed.length})</h3>
          <button className="btn icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {completed.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Todavía no marcaste nada como hecho.</p>
        ) : (
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {completed.map((item) => {
              const cat = getCategory(item.category);
              const proj = projectNameFor(projects, item);
              const tip = getTipificado(item.tipificado);
              return (
                <div key={item.id} style={{ background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 13.5 }}>{item.name}</span>
                    <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => onRevert(item.id)}>↺ Volver a pendiente</button>
                  </div>
                  <div className="item-meta" style={{ marginTop: 0 }}>
                    <span className="badge chip" style={{ borderColor: cat.color, color: cat.color }}>{cat.label}</span>
                    {proj && <span className="badge chip">{proj}</span>}
                    <span className="badge chip">{tip.label}</span>
                    <span className="badge chip">✓ {formatDoneAt(item.doneAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
