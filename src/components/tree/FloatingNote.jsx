import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
const DRAG_THRESHOLD = 4;
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

export function FloatingNote({ note, editing, onStartEdit, onCommit, onDelete, onMove, onToggleCollapse, onColorChange }) {
  const [draft, setDraft] = useState(note.text);
  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [menu, setMenu] = useState(null);
  const dragRef = useRef({ moved: false, startX: 0, startY: 0, origX: 0, origY: 0, curX: 0, curY: 0 });
  const clickTimerRef = useRef(null);
  const bg = note.color || NOTE_COLORS[0];

  // Si la posición cambia desde afuera (otra pestaña, respaldo restaurado),
  // el drag local se resincroniza con la fuente de verdad.
  useEffect(() => { setPos({ x: note.x, y: note.y }); }, [note.x, note.y]);
  useEffect(() => () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current); }, []);

  function handleMouseMove(e) {
    const d = dragRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) {
      const x = Math.max(0, d.origX + dx);
      const y = Math.max(0, d.origY + dy);
      d.curX = x; d.curY = y;
      setPos({ x, y });
    }
  }
  function handleMouseUp() {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    const d = dragRef.current;
    if (d.moved && typeof onMove === "function") onMove(note.id, d.curX, d.curY);
  }
  function handleMouseDown(e) {
    if (editing || e.button !== 0) return;
    if (e.target.closest(".note-del")) return;
    dragRef.current = { moved: false, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, curX: pos.x, curY: pos.y };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleClick() {
    if (dragRef.current.moved || editing) return;
    if (clickTimerRef.current) return;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onStartEdit(note.id);
    }, CLICK_DELAY);
  }
  function handleDoubleClick() {
    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    if (dragRef.current.moved || editing) return;
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
      className={`floating-note ${editing ? "editing" : ""}`}
      style={{ left: pos.x, top: pos.y, background: bg }}
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
          {note.text}
          <button className="note-del" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} aria-label="Quitar nota">✕</button>
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
