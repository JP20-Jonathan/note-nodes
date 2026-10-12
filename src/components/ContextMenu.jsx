import { createPortal } from "react-dom";

// Menú de clic derecho genérico — mismo patrón que NoteColorMenu
// (FloatingNote.jsx): portal directo a <body> + backdrop fixed transparente
// + posición fixed en coordenadas de pantalla (clientX/Y), para que nunca
// quede recortado por el overflow:hidden del lienzo ni se mueva con el
// zoom/paneo del árbol debajo. Generalizado para reusarse en más de un
// lugar (clic derecho en el lienzo vacío → nueva nota; clic derecho en un
// nodo → borradores guardados) en vez de duplicar el patrón cada vez.
// items: [{ label, onClick }]
export function ContextMenu({ x, y, items, onClose }) {
  return createPortal(
    <>
      <div className="context-menu-backdrop" onMouseDown={onClose} />
      <div className="context-menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
        {items.map((item, i) => (
          <button key={i} className="context-menu-item" onClick={() => { item.onClick(); onClose(); }}>
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}
