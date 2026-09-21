import { useState } from "react";
import { getCategory } from "../../data/categories.js";
import { TIPIFICADO_ICON } from "../../data/tipificados.js";
import { deadlineChipClass, projectNameFor } from "../../data/businessRules.js";
import { shortDateStr } from "../../data/dateUtils.js";
import { COLUMN_DRAG_TYPE, sizeLabel } from "../../hooks/useColumnLayout.js";

// Arrastrar: cualquier pendiente se puede soltar en otra columna para
// reasignarlo a ese tipificado (onDropItem decide en App.jsx si es
// reorden dentro del mismo grupo o reasignación a otro). Los que no
// tienen fecha límite además se pueden reordenar entre ellos soltando
// sobre un compañero de columna. draggingId/dragOverId son puramente
// visuales. El título (⠿) es un asa aparte para reordenar la COLUMNA
// completa entre sus compañeras del mismo grupo (arrastrar-y-soltar sobre
// otra cabecera), y el botón S/M/L cicla su tamaño — ambos se recuerdan
// por navegador (useColumnLayout, en App.jsx/TableroView).
export function TableroColumn({ tip, list, onDropItem, todayStr, projects, size, onMoveColumn, onCycleSize, onOpenDetail, dragGhost }) {
  const capLabel = tip.cap != null ? `${list.length}/${tip.cap}` : `${list.length}`;
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [colDragOver, setColDragOver] = useState(false);

  return (
    <div className={`tab-col size-${size} ${tip.id === "urgentes" || tip.id === "importantisimas" ? "special" : ""}`}>
      <div
        className={`tab-col-head ${colDragOver ? "drag-over" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) { e.preventDefault(); setColDragOver(true); } }}
        onDragLeave={() => setColDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) return;
          e.preventDefault();
          setColDragOver(false);
          onMoveColumn(e.dataTransfer.getData(COLUMN_DRAG_TYPE), tip.id);
        }}
      >
        <h3>
          <span
            className="tab-col-drag-handle" aria-hidden="true" title="Arrastra para reordenar esta columna"
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData(COLUMN_DRAG_TYPE, tip.id); }}
          >⠿</span>{" "}
          {TIPIFICADO_ICON[tip.id]} {tip.label}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{capLabel}</span>
          <button type="button" className="tab-col-size-btn" title="Cambiar tamaño" onClick={onCycleSize}>{sizeLabel(size)}</button>
          <button type="button" className="tab-col-expand-btn" title={expanded ? "Contraer" : "Expandir"} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "⤡" : "⤢"}
          </button>
        </div>
      </div>
      <div
        className={`tab-col-list ${expanded ? "expanded" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId) onDropItem(draggedId, null, tip.id);
          setDraggingId(null);
          setDragOverId(null);
          dragGhost.end();
        }}
      >
        {list.length === 0 ? (
          <div className="empty-state" style={{ margin: 8 }}>Vacío por ahora. Arrastra un pendiente aquí.</div>
        ) : (
          list.map((item, idx) => {
            const cat = getCategory(item.category);
            const proj = projectNameFor(projects, item);
            const color = item.deadline
              ? (deadlineChipClass(item.deadline, todayStr).includes("soon") ? "var(--sema-red)" : deadlineChipClass(item.deadline, todayStr).includes("week") ? "var(--sema-yellow)" : "var(--sema-green)")
              : (idx < 2 ? "var(--sema-red)" : idx < 5 ? "var(--sema-yellow)" : "var(--sema-green)");
            return (
              <div
                className={`tab-row ${dragOverId === item.id && draggingId && draggingId !== item.id ? "drag-over" : ""}`}
                key={item.id}
                draggable
                onClick={() => onOpenDetail(item)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", item.id);
                  setDraggingId(item.id);
                  dragGhost.start(item.name, e);
                }}
                onDrag={(e) => dragGhost.move(e)}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverId(item.id);
                }}
                onDragLeave={() => setDragOverId((prev) => (prev === item.id ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const draggedId = e.dataTransfer.getData("text/plain");
                  if (draggedId && draggedId !== item.id) onDropItem(draggedId, item.id, tip.id);
                  setDraggingId(null);
                  setDragOverId(null);
                  dragGhost.end();
                }}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); dragGhost.end(); }}
                style={{ opacity: draggingId === item.id ? 0.35 : 1, cursor: "pointer" }}
              >
                <span className="sema-dot" style={{ background: color, color }} />
                <div className="tab-row-body">
                  <div className="tab-row-name">{item.name}</div>
                  <div className="tab-row-meta">
                    <span className="badge chip" style={{ borderColor: cat.color, color: cat.color }}>{cat.label}</span>
                    {proj && <span className="badge chip">{proj}</span>}
                    {item.deadline && <span className={deadlineChipClass(item.deadline, todayStr)}>vence {shortDateStr(item.deadline)}</span>}
                  </div>
                </div>
                <span className="drag-handle" aria-hidden="true">⠿</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
