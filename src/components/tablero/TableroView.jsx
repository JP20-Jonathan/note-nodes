import { useState } from "react";
import { getTipificado } from "../../data/tipificados.js";
import { isOverdue } from "../../data/businessRules.js";
import { monthLabel, shortDateStr } from "../../data/dateUtils.js";
import { useColumnLayout } from "../../hooks/useColumnLayout.js";
import { TableroColumn } from "./TableroColumn.jsx";

const SEMANA_IDS = ["esta_semana", "siguientes_actividades", "proxima_semana"];
const MES_IDS = ["este_mes", "proximo_mes"];
const SIN_FECHA_IDS = ["sin_tipificar", "urgentes", "importantisimas"];

export function TableroView({ items, projects, currentMonthKey, currentWeekStart, onDropItem, onRenew, onEditOverdue, onOpenDetail, dragGhost }) {
  const todayStr = `${currentMonthKey}-01`;
  const overdue = items.filter((i) => !i.done && isOverdue(i, currentMonthKey, currentWeekStart));

  // Un grupo por fila (Semana/Mes/Sin fecha fija) — reordenar y redimensionar
  // se hace DENTRO de cada grupo, nunca cruzando de uno a otro, porque esas
  // filas agrupan tipificados por su scope (semana/mes/ninguno) y mezclarlas
  // no tendría sentido semántico.
  const semana = useColumnLayout("semana", SEMANA_IDS);
  const mes = useColumnLayout("mes", MES_IDS);
  const sinFecha = useColumnLayout("sinfecha", SIN_FECHA_IDS);

  function bucket(tipId) {
    return items
      .filter((i) => !i.done && i.tipificado === tipId && !isOverdue(i, currentMonthKey, currentWeekStart))
      .sort((a, b) => {
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        return (a.order || 0) - (b.order || 0);
      });
  }

  const [showOverdue, setShowOverdue] = useState(true);

  return (
    <div>
      {overdue.length > 0 && (
        <div className="alert-banner" onClick={() => setShowOverdue((s) => !s)}>
          <div className="alert-banner-head">⚠ Tienes {overdue.length} pendiente{overdue.length === 1 ? "" : "s"} atrasado{overdue.length === 1 ? "" : "s"} {showOverdue ? "▲" : "▼"}</div>
          {showOverdue && (
            <div className="alert-list">
              {overdue.map((item) => (
                <div
                  className="alert-item"
                  key={item.id}
                  draggable
                  onClick={(e) => { e.stopPropagation(); onOpenDetail(item); }}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", item.id);
                    dragGhost.start(item.name, e);
                  }}
                  onDrag={(e) => dragGhost.move(e)}
                  onDragEnd={() => dragGhost.end()}
                  style={{ cursor: "pointer" }}
                >
                  <span className="sema-dot node-pulse-red" style={{ background: "var(--sema-red)", color: "var(--sema-red)" }} />
                  <div className="alert-item-body">
                    <div>{item.name}</div>
                    <div className="alert-item-tag">
                      {getTipificado(item.tipificado).scope === "month" ? `Atrasado de ${monthLabel(item.anchorMonth)}` : `Atrasado de la semana del ${shortDateStr(item.anchorWeek)}`}
                    </div>
                  </div>
                  <button className="btn icon-btn" onClick={(e) => { e.stopPropagation(); onRenew(item.id); }} title="Actualizar a la actual">↻</button>
                  <button className="btn icon-btn" onClick={(e) => { e.stopPropagation(); onEditOverdue(item); }} aria-label="Editar">✎</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="tipificado-help">Los que tienen fecha se ordenan solos por cercanía. Los demás los ordenas tú arrastrándolos.</p>

      <div className="tablero-row-label">Semana</div>
      <div className="tablero-grid cols-3">
        {semana.order.map((tipId) => (
          <TableroColumn
            key={tipId} tip={getTipificado(tipId)} list={bucket(tipId)} onDropItem={onDropItem} todayStr={todayStr} projects={projects} onOpenDetail={onOpenDetail} dragGhost={dragGhost}
            size={semana.sizeOf(tipId)} onMoveColumn={semana.moveColumn} onCycleSize={() => semana.cycleSize(tipId)}
          />
        ))}
      </div>

      <div className="tablero-row-label">Mes</div>
      <div className="tablero-grid cols-2">
        {mes.order.map((tipId) => (
          <TableroColumn
            key={tipId} tip={getTipificado(tipId)} list={bucket(tipId)} onDropItem={onDropItem} todayStr={todayStr} projects={projects} onOpenDetail={onOpenDetail} dragGhost={dragGhost}
            size={mes.sizeOf(tipId)} onMoveColumn={mes.moveColumn} onCycleSize={() => mes.cycleSize(tipId)}
          />
        ))}
      </div>

      <div className="tablero-row-label">Sin fecha fija</div>
      <div className="tablero-grid cols-wrap">
        {sinFecha.order.map((tipId) => (
          <TableroColumn
            key={tipId} tip={getTipificado(tipId)} list={bucket(tipId)} onDropItem={onDropItem} todayStr={todayStr} projects={projects} onOpenDetail={onOpenDetail} dragGhost={dragGhost}
            size={sinFecha.sizeOf(tipId)} onMoveColumn={sinFecha.moveColumn} onCycleSize={() => sinFecha.cycleSize(tipId)}
          />
        ))}
      </div>
    </div>
  );
}
