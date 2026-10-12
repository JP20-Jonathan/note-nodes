import { useRef, useState } from "react";
import { renderInlineMarkdown } from "../miniMarkdown.jsx";
import { SubPendienteForm } from "./SubPendienteForm.jsx";

const DRAG_THRESHOLD = 4;
const CARD_WIDTH = 170;
const EDIT_CARD_WIDTH = 220;

// Estimado de alto de una tarjeta — nunca se mide el DOM real (evitaría un
// ciclo extra de render en cada arrastre), solo una aproximación por
// cantidad de texto, igual de "a ojo" que ya usa ForceGraph.jsx
// (estimateItemCardHeight) para las tarjetas del Árbol.
function estimateCardHeight(name, notes) {
  const charsPerLine = 24;
  const nameLines = Math.max(1, Math.ceil((name || "").length / charsPerLine));
  const notesLines = notes ? Math.max(1, Math.ceil(notes.length / charsPerLine)) : 0;
  return 30 + nameLines * 15 + (notesLines ? 6 + notesLines * 13 : 0);
}

// Posiciones iniciales en círculo alrededor del pendiente real (su tarjeta
// — ver ItemDetailPopover, que ahora es arrastrable y hace de centro de
// esta red) — el usuario las reacomoda a su gusto desde ahí. No se
// persiste a propósito: es una exploración puntual de esta sesión, no una
// preferencia a recordar entre aperturas (ver comentario similar en
// IndicatorsPanel/ColorLegend, que sí persisten porque ESAS son
// preferencias de layout duraderas).
function defaultPositions(centerX, centerY, radius, subPendientes) {
  const positions = {};
  subPendientes.forEach((sub, i) => {
    const angle = (i / subPendientes.length) * Math.PI * 2 - Math.PI / 2;
    positions[sub.id] = {
      x: centerX + Math.cos(angle) * radius - CARD_WIDTH / 2,
      y: centerY + Math.sin(angle) * radius - 24,
    };
  });
  return positions;
}

// Tarjetas chicas de subpendientes, arrastrables, conectadas por líneas a
// la tarjeta REAL del pendiente padre (pendienteRect: su posición/tamaño en
// pantalla, medido por ItemDetailPopover — ver su propio drag del header).
// No se duplica una tarjeta aparte para el pendiente acá: la que ya existe
// (el popover grande) ES el centro de esta red. Vive DENTRO del mismo
// .modal-backdrop que ItemDetailPopover (mismo fondo oscurecido, mismo
// "clic afuera para cerrar"), y antes que .pnd-modal en el DOM a propósito
// — sin z-index propio, el orden del DOM ya basta para que el popover
// quede arriba, y las tarjetas de subpendientes detrás/alrededor, nunca
// tapándolo.
//
// El arrastre se maneja acá, no con useDraggablePosition (el hook que ya
// usan FloatingNote/IndicatorsPanel/ColorLegend): ese hook solo expone la
// posición de SU PROPIO nodo y avisa el commit final — acá hace falta la
// posición de TODAS las tarjetas en todo momento (no solo al soltar) para
// poder redibujar las líneas mientras se arrastra.
export function SubPendientesWeb({ subPendientes, pendienteRect, onClose, onEditSubPendiente }) {
  const [positions, setPositions] = useState(() => {
    const centerX = pendienteRect.left + pendienteRect.width / 2;
    const centerY = pendienteRect.top + pendienteRect.height / 2;
    const radius = Math.max(220, pendienteRect.width / 2 + 160);
    return defaultPositions(centerX, centerY, radius, subPendientes);
  });
  const [editingId, setEditingId] = useState(null);
  const dragRef = useRef({ id: null, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const dragEndedRef = useRef(false);

  function handleMouseMove(e) {
    const d = dragRef.current;
    if (!d.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPositions((prev) => ({ ...prev, [d.id]: { x: d.origX + dx, y: d.origY + dy } }));
  }
  function handleMouseUp() {
    // Si el puntero viajó rápido, el click que sigue al soltar puede
    // resolverse contra el fondo en vez de la tarjeta — ese click no debe
    // cerrar toda la red (ver el onClick de .subweb-overlay).
    dragEndedRef.current = dragRef.current.moved;
    dragRef.current.id = null;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }
  function handleCardMouseDown(id, e) {
    if (e.button !== 0 || editingId === id) return;
    e.stopPropagation();
    const pos = positions[id];
    dragRef.current = { id, moved: false, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  const pendienteCenter = {
    x: pendienteRect.left + pendienteRect.width / 2,
    y: pendienteRect.top + pendienteRect.height / 2,
  };

  return (
    <div
      className="subweb-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (dragEndedRef.current) { dragEndedRef.current = false; return; }
        onClose();
      }}
    >
      <svg className="subweb-lines">
        {subPendientes.map((sub) => {
          const pos = positions[sub.id];
          const w = editingId === sub.id ? EDIT_CARD_WIDTH : CARD_WIDTH;
          const cy = pos.y + estimateCardHeight(sub.name, sub.notes) / 2;
          return (
            <line
              key={sub.id}
              x1={pendienteCenter.x} y1={pendienteCenter.y}
              x2={pos.x + w / 2} y2={cy}
              stroke="var(--accent)" strokeWidth={1.5} opacity={0.5}
            />
          );
        })}
      </svg>

      {subPendientes.map((sub) => {
        const pos = positions[sub.id];
        const isEditing = editingId === sub.id;
        return (
          <div
            key={sub.id}
            className="subweb-card"
            style={{ left: pos.x, top: pos.y, width: isEditing ? EDIT_CARD_WIDTH : CARD_WIDTH }}
            onMouseDown={(e) => handleCardMouseDown(sub.id, e)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setEditingId(sub.id)}
          >
            {isEditing ? (
              <SubPendienteForm
                initial={sub}
                onSubmit={(data) => { onEditSubPendiente(sub.id, data); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="subweb-card-name">{sub.name}</div>
                {sub.notes && <div className="subweb-card-notes">{renderInlineMarkdown(sub.notes)}</div>}
              </>
            )}
          </div>
        );
      })}

      <button
        type="button" className="btn icon-btn subweb-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Cerrar red de subpendientes" title="Cerrar red"
      >
        ✕ Cerrar red
      </button>
    </div>
  );
}
