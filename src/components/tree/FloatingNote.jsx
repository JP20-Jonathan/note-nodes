import { useState } from "react";

// Nota flotante tipo Post-it. Ya no se puede arrastrar (esa pieza se
// retiró junto con el drag-to-assign de categoría): se crea con 2 toques
// sobre el lienzo, se edita con doble clic y se borra con el botón ✕. La
// asignación a una categoría queda pendiente de una fase futura (menú de
// clic derecho), como lo pidió el usuario.
export function FloatingNote({ note, editing, onStartEdit, onCommit, onDelete }) {
  const [draft, setDraft] = useState(note.text);
  return (
    <div
      className={`floating-note ${editing ? "editing" : ""}`}
      style={{ left: note.x, top: note.y }}
      onDoubleClick={() => onStartEdit(note.id)}
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
          <button className="note-del" onClick={() => onDelete(note.id)} aria-label="Quitar nota">✕</button>
        </>
      )}
    </div>
  );
}
