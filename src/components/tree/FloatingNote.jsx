import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderInlineMarkdown } from "../miniMarkdown.jsx";
import { useDraggablePosition } from "../../hooks/useDraggablePosition.js";

// Nota flotante tipo Post-it, expandida. Interacciones:
//   - Arrastrar: clic sostenido y mover (igual que los nodos del árbol).
//   - Clic simple (sin arrastre): entra a editar el texto. Se retrasa un
//     poco (CLICK_DELAY) para poder distinguirlo de la primera mitad de un
//     doble clic — mismo problema que ya resuelve App.jsx a mano para crear
//     notas sobre el lienzo.
//   - Doble clic: colapsa la nota — deja de renderizarse aquí y pasa a la
//     lista de notas encogidas (ver CollapsedNoteChip más abajo).
//   - Clic derecho: menú rápido para cambiar de color o eliminar la nota.
export const NOTE_COLORS = ["#F4E4B8", "#F7C6D9", "#C8ECD9", "#C7DFF7", "#E3D2F5", "#F7D8B8"];
const CLICK_DELAY = 300;

// El menú de clic derecho se monta con un portal directo a <body> — antes
// vivía como hijo del propio div de la nota, así que un clic ahí dentro
// burbujeaba hacia los handlers de arrastre/edición de la nota (por eso el
// cambio de color no "pegaba": el mousedown del swatch disparaba el drag de
// la nota por debajo). Al ser un hijo de body, deja de tener cualquier
// relación de bubbling con la nota.
function NoteColorMenu({ x, y, onPick, onDelete, onClose }) {
  return createPortal(
    <>
      <div className="note-menu-backdrop" onMouseDown={onClose} />
      <div className="note-color-menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
        {NOTE_COLORS.map((c) => (
          <button key={c} className="note-color-swatch" style={{ background: c }} onClick={() => onPick(c)} aria-label={`Color ${c}`} />
        ))}
        <button className="note-menu-delete" onClick={onDelete}>Eliminar</button>
      </div>
    </>,
    document.body
  );
}

// Tamaño mínimo al redimensionar desde la esquina — que nunca quede tan
// chica que el texto o los botones (✕, la propia esquina) se encimen.
const MIN_WIDTH = 140;
const MIN_HEIGHT = 70;

export function FloatingNote({ note, editing, onStartEdit, onCommit, onDelete, onMove, onToggleCollapse, onColorChange, onResize }) {
  const [draft, setDraft] = useState(note.text);
  const { pos, setPos, handleMouseDown: startDrag, didMove } = useDraggablePosition(
    { x: note.x, y: note.y },
    (x, y) => { if (typeof onMove === "function") onMove(note.id, x, y); },
  );
  // null/null = todavía sin redimensionar a mano — usa el tamaño por
  // defecto del CSS (ancho fijo, alto que crece solo con el texto). Una vez
  // que se arrastra la esquina, queda un tamaño explícito en px, guardado
  // (ver onResize) igual que ya se guarda la posición.
  const [size, setSize] = useState({ width: note.width || null, height: note.height || null });
  const [menu, setMenu] = useState(null);
  const clickTimerRef = useRef(null);
  const noteRef = useRef(null);
  const bg = note.color || NOTE_COLORS[0];

  // Si la posición/tamaño cambian desde afuera (otra pestaña, respaldo
  // restaurado), el estado local se resincroniza con la fuente de verdad.
  useEffect(() => { setPos({ x: note.x, y: note.y }); }, [note.x, note.y]);
  useEffect(() => { setSize({ width: note.width || null, height: note.height || null }); }, [note.width, note.height]);
  useEffect(() => () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current); }, []);

  function handleMouseDown(e) {
    if (editing || e.button !== 0) return;
    if (e.target.closest(".note-del") || e.target.closest(".note-resize-handle")) return;
    startDrag(e);
  }

  // Arrastrar la esquina inferior-derecha — mismo patrón de mousedown/
  // mousemove/mouseup en window que el resto del arrastre manual de esta
  // sesión (ver ItemDetailPopover/SubPendientesWeb): start/width/height
  // viven en variables locales del cierre, no en el estado de React, para
  // que onUp lea el valor FINAL exacto sin depender de un re-render previo.
  function handleResizeMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = noteRef.current.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, origW: rect.width, origH: rect.height };
    let width = start.origW;
    let height = start.origH;
    function onMove(ev) {
      width = Math.max(MIN_WIDTH, Math.round(start.origW + (ev.clientX - start.x)));
      height = Math.max(MIN_HEIGHT, Math.round(start.origH + (ev.clientY - start.y)));
      setSize({ width, height });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (typeof onResize === "function") onResize(note.id, width, height);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleClick() {
    if (didMove() || editing) return;
    if (clickTimerRef.current) return;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onStartEdit(note.id);
    }, CLICK_DELAY);
  }
  function handleDoubleClick() {
    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    if (didMove() || editing) return;
    if (typeof onToggleCollapse === "function") onToggleCollapse(note.id);
  }
  function handleContextMenu(e) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }
  function pickColor(color) {
    if (typeof onColorChange === "function") onColorChange(note.id, color);
    setMenu(null);
  }

  return (
    <div
      ref={noteRef}
      className={`floating-note ${editing ? "editing" : ""}`}
      style={{ left: pos.x, top: pos.y, background: bg, width: size.width || undefined, height: size.height || undefined }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCommit(draft); } }}
          onBlur={() => onCommit(draft)}
          placeholder="Escribe el pendiente…"
        />
      ) : (
        <>
          {renderInlineMarkdown(note.text)}
          <button className="note-del" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} aria-label="Quitar nota">✕</button>
          <div className="note-resize-handle" onMouseDown={handleResizeMouseDown} title="Arrastra para cambiar el tamaño" />
        </>
      )}

      {menu && (
        <NoteColorMenu
          x={menu.x} y={menu.y}
          onPick={pickColor}
          onDelete={() => { onDelete(note.id); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// Nota colapsada: ya no vive en su x/y libre — se apila en un riel fijo al
// lado derecho de la pantalla (ver .notes-rail en App.jsx/index.css), cada
// una mostrando su primera línea como "título" para poder distinguirlas sin
// tener que abrirlas. Antes se encogían en el mismo lugar donde estaban, lo
// que en la práctica las mandaba fuera de la vista (abajo del lienzo) si
// habían quedado cerca del borde — apilarlas en un riel fijo evita ese
// problema de raíz.
export function CollapsedNoteChip({ note, onExpand, onDelete, onColorChange }) {
  const [menu, setMenu] = useState(null);
  const bg = note.color || NOTE_COLORS[0];
  const title = (note.text || "").split("\n")[0].trim() || "(sin texto)";

  function handleContextMenu(e) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }
  function pickColor(color) {
    if (typeof onColorChange === "function") onColorChange(note.id, color);
    setMenu(null);
  }

  return (
    <div
      className="note-chip"
      style={{ background: bg }}
      onDoubleClick={() => onExpand(note.id)}
      onContextMenu={handleContextMenu}
      title={note.text}
    >
      <span className="note-chip-title">{title}</span>

      {menu && (
        <NoteColorMenu
          x={menu.x} y={menu.y}
          onPick={pickColor}
          onDelete={() => { onDelete(note.id); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
