import { getCategory } from "../../data/categories.js";
import { getTipificado } from "../../data/tipificados.js";
import { deadlineChipClass, isOverdue, projectNameFor } from "../../data/businessRules.js";
import { monthLabel, shortDateStr } from "../../data/dateUtils.js";

// Detalle de un pendiente (al tocar su nodo)
export function ItemDetailPopover({ item, projects, currentMonthKey, currentWeekStart, onClose, onToggleDone, onEdit, onDelete, onRenew }) {
  const cat = getCategory(item.category);
  const proj = projectNameFor(projects, item);
  const tip = getTipificado(item.tipificado);
  const overdue = isOverdue(item, currentMonthKey, currentWeekStart);
  const todayStr = `${currentMonthKey}-01`;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pnd-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <h3 className="pnd-serif" style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
          <button className="btn icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="item-meta">
          <span className="badge chip" style={{ borderColor: cat.color, color: cat.color }}>{cat.label}</span>
          {proj && <span className="badge chip">{proj}</span>}
          <span className="badge chip">{tip.label}</span>
          {item.deadline && <span className={deadlineChipClass(item.deadline, todayStr)}>vence {shortDateStr(item.deadline)}</span>}
          {overdue && <span className="badge chip" style={{ borderColor: "var(--sema-red)", color: "var(--sema-red)" }}>
            {tip.scope === "month" ? `Atrasado de ${monthLabel(item.anchorMonth)}` : `Atrasado de la semana del ${shortDateStr(item.anchorWeek)}`}
          </span>}
        </div>
        {item.notes && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", whiteSpace: "pre-wrap", background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px" }}>
            {item.notes}
          </p>
        )}
        <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => onToggleDone(item.id)}>{item.done ? "Marcar pendiente" : "✓ Marcar hecho"}</button>
          {overdue && <button className="btn btn-ghost" onClick={() => onRenew(item.id)}>↻ Renovar</button>}
          <button className="btn btn-ghost" onClick={() => onEdit(item)}>✎ Editar</button>
          <button className="btn btn-ghost" onClick={() => onDelete(item.id)}>🗑 Eliminar</button>
        </div>
      </div>
    </div>
  );
}
