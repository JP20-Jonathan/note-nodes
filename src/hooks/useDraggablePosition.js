import { useRef, useState } from "react";

const DRAG_THRESHOLD = 4;

// Arrastre libre por mouse — mismo patrón que ya usaba FloatingNote.jsx,
// generalizado para reusarse en cualquier panel flotante que el usuario
// pueda mover (notas, panel de indicadores, leyenda de colores). Devuelve
// la posición actual y el handler de mousedown para arrancar el arrastre;
// onCommit(x, y) se llama solo al soltar Y solo si realmente se movió más
// que el umbral (así un simple clic no cuenta como arrastre).
export function useDraggablePosition(initialPos, onCommit) {
  const [pos, setPos] = useState(initialPos);
  const dragRef = useRef({ moved: false, startX: 0, startY: 0, origX: 0, origY: 0, curX: 0, curY: 0 });

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
    if (d.moved && typeof onCommit === "function") onCommit(d.curX, d.curY);
  }
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    dragRef.current = { moved: false, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, curX: pos.x, curY: pos.y };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return { pos, setPos, handleMouseDown, didMove: () => dragRef.current.moved };
}
