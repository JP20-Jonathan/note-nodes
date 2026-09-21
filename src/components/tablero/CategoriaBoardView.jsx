import { useState } from "react";
import { CATEGORIES, getCategory } from "../../data/categories.js";
import { getTipificado, TIPIFICADO_ICON } from "../../data/tipificados.js";
import { deadlineChipClass, projectNameFor } from "../../data/businessRules.js";
import { shortDateStr } from "../../data/dateUtils.js";
import { COLUMN_DRAG_TYPE, sizeLabel, useColumnLayout } from "../../hooks/useColumnLayout.js";

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

// Tinte muy sutil para los 3 tipificados de "ya agendado esta semana o la
// próxima" — no desaparecen de su categoría, solo se ven más transparentes
// y se listan al final, para distinguir de un vistazo "esto ya lo
// programé" de "esto sigue en backlog". siguientes_actividades queda a
// propósito entre el verde y el amarillo, con una diferencia mínima frente
// a los otros dos.
const WEEK_TINT = {
  esta_semana: "rgba(76, 175, 125, 0.14)",
  siguientes_actividades: "rgba(139, 184, 107, 0.14)",
  proxima_semana: "rgba(234, 197, 79, 0.14)",
};

function sortForCategoria(items) {
  return [...items].sort((a, b) => {
    const aScheduled = WEEK_TINT[a.tipificado] != null;
    const bScheduled = WEEK_TINT[b.tipificado] != null;
    if (aScheduled !== bScheduled) return aScheduled ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function ItemRow({ item, projects, todayStr, onOpenDetail, dragGhost }) {
  const tip = getTipificado(item.tipificado);
  const tint = WEEK_TINT[item.tipificado];
  const proj = projectNameFor(projects, item);
  return (
    <div
      className="tab-row"
      draggable
      onClick={() => onOpenDetail(item)}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); dragGhost.start(item.name, e); }}
      onDrag={(e) => dragGhost.move(e)}
      onDragEnd={() => dragGhost.end()}
      style={{ ...(tint ? { background: tint, opacity: 0.65 } : null), cursor: "pointer" }}
    >
      <div className="tab-row-body">
        <div className="tab-row-name">{item.name}</div>
        <div className="tab-row-meta">
          <span className="badge chip">{TIPIFICADO_ICON[tip.id]} {tip.label}</span>
          {proj && <span className="badge chip">{proj}</span>}
          {item.deadline && <span className={deadlineChipClass(item.deadline, todayStr)}>vence {shortDateStr(item.deadline)}</span>}
        </div>
      </div>
      <span className="drag-handle" aria-hidden="true">⠿</span>
    </div>
  );
}

// Recuadro donde sueltas un pendiente de cualquier categoría para
// agendarlo — reutiliza la misma reasignación que ya usa el Tablero por
// tipificación (onSchedule = reassignItem), solo que aquí siempre apunta
// al tipificado fijo del recuadro (esta_semana o proxima_semana). Muestra
// lo que ya tiene agendado, así crece con la lista en vez de quedarse
// siempre con el mismo tamaño vacío.
function ScheduleDropBox({ className, label, tipificado, items, onSchedule, dragGhost }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`categoria-schedule-box ${className || ""} ${over ? "drag-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId) onSchedule(draggedId, tipificado);
        dragGhost.end();
      }}
    >
      <div className="categoria-schedule-box-head">{label} <span>{items.length}</span></div>
      {items.length > 0 && (
        <div className="categoria-schedule-box-list">
          {items.map((item) => {
            const cat = getCategory(item.category);
            return (
              <div key={item.id} className="badge chip" style={{ borderColor: cat.color, color: cat.color }}>
                {item.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Una columna de categoría, con tope de alto (se ve scroll adentro si hay
// muchos) y un botón para expandirla del todo si se prefiere ver todo sin
// scroll — mismo patrón que TableroColumn, para que las dos vistas del
// Tablero se comporten igual de "compactas por defecto". El "+" crea un
// pendiente directo en esa categoría (abre el mismo formulario de siempre,
// con la categoría ya preseleccionada).
function CategoriaColumn({ cat, items, projects, todayStr, onCreate, size, onMoveColumn, onCycleSize, onOpenDetail, dragGhost }) {
  const [expanded, setExpanded] = useState(false);
  const [colDragOver, setColDragOver] = useState(false);
  return (
    <div className={`tab-col size-${size}`} style={{ borderColor: cat.color }}>
      <div
        className={`tab-col-head ${colDragOver ? "drag-over" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) { e.preventDefault(); setColDragOver(true); } }}
        onDragLeave={() => setColDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) return;
          e.preventDefault();
          setColDragOver(false);
          onMoveColumn(e.dataTransfer.getData(COLUMN_DRAG_TYPE), cat.id);
        }}
      >
        <h3>
          <span
            className="tab-col-drag-handle" aria-hidden="true" title="Arrastra para reordenar esta columna"
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData(COLUMN_DRAG_TYPE, cat.id); }}
          >⠿</span>{" "}
          {cat.emoji} {cat.label}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="tab-col-add-btn" title={`Nuevo pendiente en ${cat.label}`} onClick={() => onCreate(cat.id)}>+</button>
          <span>{items.length}</span>
          <button type="button" className="tab-col-size-btn" title="Cambiar tamaño" onClick={onCycleSize}>{sizeLabel(size)}</button>
          <button type="button" className="tab-col-expand-btn" title={expanded ? "Contraer" : "Expandir"} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "⤡" : "⤢"}
          </button>
        </div>
      </div>
      <div className={`tab-col-list ${expanded ? "expanded" : ""}`}>
        {items.length === 0 ? (
          <div className="empty-state" style={{ margin: 8 }}>Vacío por ahora.</div>
        ) : (
          items.map((item) => <ItemRow key={item.id} item={item} projects={projects} todayStr={todayStr} onOpenDetail={onOpenDetail} dragGhost={dragGhost} />)
        )}
      </div>
    </div>
  );
}

// Backlog: columnas de categoría con TODOS los pendientes activos (sin
// importar el tipificado) — arrastras uno hacia "Esta semana" o "Próxima
// semana" para agendarlo. No desaparece de su categoría: se queda ahí,
// transparente y al final de la lista, así siempre tienes panorama
// completo de cada categoría en el mismo lugar.
export function CategoriaBoardView({ items, projects, todayStr, onSchedule, onCreate, onOpenDetail, dragGhost }) {
  const estaSemana = items.filter((i) => !i.done && i.tipificado === "esta_semana");
  const proximaSemana = items.filter((i) => !i.done && i.tipificado === "proxima_semana");
  const layout = useColumnLayout("categoria", CATEGORY_IDS);

  return (
    <div>
      <div className="categoria-schedule-row">
        <ScheduleDropBox className="categoria-schedule-box--main" label="🌕 Esta semana" tipificado="esta_semana" items={estaSemana} onSchedule={onSchedule} dragGhost={dragGhost} />
        <ScheduleDropBox className="categoria-schedule-box--side" label="🌗 Próxima semana" tipificado="proxima_semana" items={proximaSemana} onSchedule={onSchedule} dragGhost={dragGhost} />
      </div>
      <div className="tablero-grid cols-wrap">
        {layout.order.map((catId) => {
          const cat = getCategory(catId);
          return (
            <CategoriaColumn
              key={cat.id} cat={cat} projects={projects} todayStr={todayStr} onCreate={onCreate}
              items={sortForCategoria(items.filter((i) => !i.done && i.category === cat.id))}
              size={layout.sizeOf(cat.id)} onMoveColumn={layout.moveColumn} onCycleSize={() => layout.cycleSize(cat.id)}
              onOpenDetail={onOpenDetail} dragGhost={dragGhost}
            />
          );
        })}
      </div>
    </div>
  );
}
