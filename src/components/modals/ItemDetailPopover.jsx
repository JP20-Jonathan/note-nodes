import { useRef, useState } from "react";
import { getCategory } from "../../data/categories.js";
import { getTipificado } from "../../data/tipificados.js";
import { deadlineChipClass, deadlineVerb, isOverdue, projectNameFor } from "../../data/businessRules.js";
import { monthLabel, shortDateStr } from "../../data/dateUtils.js";
import { renderInlineMarkdown } from "../miniMarkdown.jsx";
import { SubPendienteForm } from "./SubPendienteForm.jsx";
import { SubPendientesWeb } from "./SubPendientesWeb.jsx";

// Detalle de un pendiente (al tocar su nodo). confirmDone exige un segundo
// clic antes de marcar hecho (no al desmarcar) — pensado para cuando este
// popover se abrió desde el Grafo de Nodos, donde un clic accidental sobre
// un nodo es más fácil que en el Tablero (ver App.jsx, detailSource).
export function ItemDetailPopover({
  item, projects, subPendientes, currentMonthKey, currentWeekStart, todayStr,
  onClose, onToggleDone, onEdit, onDelete, onRenew, onAddSubPendiente, onDeleteSubPendiente, onEditSubPendiente, confirmDone,
}) {
  const [armedConfirm, setArmedConfirm] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [showWeb, setShowWeb] = useState(false);
  // Posición propia de ESTA tarjeta — null mientras showWeb está apagado
  // (se queda centrada por CSS, como cualquier otro modal). Al abrir la red
  // de subpendientes (ver handleToggleWeb) se mide su posición actual en
  // pantalla y pasa a moverse "a mano" desde ahí, sin saltos, para que el
  // usuario pueda arrastrar el pendiente junto a sus subpendientes — ya no
  // existe una tarjeta aparte que represente al pendiente en esa red (ver
  // SubPendientesWeb.jsx): esta ES esa tarjeta.
  const [modalPos, setModalPos] = useState(null);
  const modalRef = useRef(null);
  // Si el gesto de soltar el arrastre (mouseup) termina sobre el fondo
  // oscurecido en vez de sobre la tarjeta (puede pasar si el puntero viaja
  // rápido y el navegador resuelve el "click" contra una posición ya vieja),
  // ese click no debe cerrar todo el popover — ver dragEndedRef más abajo y
  // el onClick de .modal-backdrop.
  const dragEndedRef = useRef(false);
  const cat = getCategory(item.category);
  const proj = projectNameFor(projects, item);
  const tip = getTipificado(item.tipificado);
  const overdue = isOverdue(item, currentMonthKey, currentWeekStart);
  const needsConfirm = confirmDone && !item.done;
  const subs = subPendientes || [];

  function handleToggleDoneClick() {
    if (needsConfirm && !armedConfirm) { setArmedConfirm(true); return; }
    setArmedConfirm(false);
    onToggleDone(item.id);
  }

  function handleAddSub(data) {
    onAddSubPendiente(item.id, data);
    setAddingSub(false);
  }

  function handleToggleWeb() {
    if (!showWeb && modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      setModalPos({ x: rect.left, y: rect.top });
    }
    setShowWeb((v) => !v);
  }

  // Arrastrar la tarjeta entera por su cabecera, solo mientras la red está
  // abierta (fuera de ahí sigue siendo un modal normal, centrado, sin
  // arrastre — no tendría sentido moverlo sin nada con qué compararlo al
  // lado). e.target.closest("button") deja pasar los clics de "+"/"✕" sin
  // iniciar un arrastre.
  function handleHeaderMouseDown(e) {
    if (!showWeb || e.button !== 0 || e.target.closest("button")) return;
    const start = { x: e.clientX, y: e.clientY, origX: modalPos.x, origY: modalPos.y };
    function onMove(ev) {
      setModalPos({ x: start.origX + (ev.clientX - start.x), y: start.origY + (ev.clientY - start.y) });
    }
    function onUp() {
      dragEndedRef.current = true;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleBackdropClick() {
    if (dragEndedRef.current) { dragEndedRef.current = false; return; }
    onClose();
  }

  // left/top salen de modalPos (estado propio, siempre al día en este mismo
  // render) en vez de leer getBoundingClientRect() de nuevo acá — ese valor
  // reflejaría el DOM ya confirmado del render ANTERIOR, un frame atrás del
  // arrastre en curso. width/height sí se miden (no cambian con el
  // arrastre, solo con el contenido), nunca hace falta que estén al milisegundo.
  const modalRect = showWeb && modalPos && modalRef.current
    ? { left: modalPos.x, top: modalPos.y, width: modalRef.current.offsetWidth, height: modalRef.current.offsetHeight }
    : null;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      {showWeb && subs.length > 0 && modalRect && (
        <SubPendientesWeb subPendientes={subs} pendienteRect={modalRect} onClose={() => setShowWeb(false)} onEditSubPendiente={(id, data) => onEditSubPendiente(id, item.id, data)} />
      )}
      <div
        ref={modalRef}
        className="pnd-modal"
        onClick={(e) => e.stopPropagation()}
        style={showWeb && modalPos ? { position: "fixed", left: modalPos.x, top: modalPos.y, margin: 0 } : undefined}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, cursor: showWeb ? "grab" : undefined }}
          onMouseDown={handleHeaderMouseDown}
        >
          <h3 className="pnd-serif" style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              className="btn icon-btn"
              onClick={() => setAddingSub((v) => !v)}
              aria-label="Añadir subpendiente"
              title="Añadir subpendiente"
            >
              +
            </button>
            <button className="btn icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div className="item-meta">
          <span className="badge chip" style={{ borderColor: cat.color, color: cat.color }}>{cat.label}</span>
          {proj && <span className="badge chip">{proj}</span>}
          <span className="badge chip">{tip.label}</span>
          {item.deadline && <span className={deadlineChipClass(item.deadline, todayStr)}>{deadlineVerb(item.deadline, todayStr)} {shortDateStr(item.deadline)}</span>}
          {overdue && <span className="badge chip" style={{ borderColor: "var(--sema-red)", color: "var(--sema-red)" }}>
            {tip.scope === "month" ? `Atrasado de ${monthLabel(item.anchorMonth)}` : `Atrasado de la semana del ${shortDateStr(item.anchorWeek)}`}
          </span>}
        </div>
        {item.notes && (
          <div style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px" }}>
            {renderInlineMarkdown(item.notes)}
          </div>
        )}

        {addingSub && (
          <SubPendienteForm onSubmit={handleAddSub} onCancel={() => setAddingSub(false)} />
        )}

        {subs.length > 0 && (
          <ul className="subpendiente-list">
            {subs.map((sub) => (
              <li key={sub.id} className="subpendiente-row">
                <div className="subpendiente-row-body">
                  <div className="subpendiente-row-name">{sub.name}</div>
                  {sub.notes && <div className="subpendiente-row-notes">{renderInlineMarkdown(sub.notes)}</div>}
                </div>
                <button
                  type="button"
                  className="icon-btn subpendiente-row-del"
                  onClick={() => onDeleteSubPendiente(sub.id, item.id)}
                  aria-label={`Eliminar subpendiente ${sub.name}`}
                  title="Eliminar subpendiente"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button
            className={`btn btn-ghost${armedConfirm ? " btn-confirm-armed" : ""}`}
            onClick={handleToggleDoneClick}
            onBlur={() => setArmedConfirm(false)}
          >
            {item.done ? "Marcar pendiente" : armedConfirm ? "¿Seguro? Sí, marcar hecho" : "✓ Marcar hecho"}
          </button>
          {overdue && <button className="btn btn-ghost" onClick={() => onRenew(item.id)}>↻ Renovar</button>}
          <button className="btn btn-ghost" onClick={() => onEdit(item)}>✎ Editar</button>
          <button className="btn btn-ghost" onClick={() => onDelete(item.id)}>🗑 Eliminar</button>
          {subs.length > 0 && (
            <button
              type="button"
              className="subpendiente-count-badge"
              onClick={handleToggleWeb}
              title={`Ver ${subs.length} subpendiente${subs.length === 1 ? "" : "s"} conectado${subs.length === 1 ? "" : "s"}`}
            >
              {subs.length}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
