import { useCallback, useEffect, useState } from "react";

// Imagen de 1x1 transparente — se la pasamos a dataTransfer.setDragImage
// para apagar la miniatura nativa que dibuja el navegador al arrastrar
// (con blur/backdrop-filter de por medio esa miniatura suele salir vacía o
// rara, que es justo lo que se sentía como "la tarjeta se queda ahí, no se
// ve que se está moviendo"). En su lugar dibujamos nosotros una etiqueta
// que sigue al cursor de verdad, así el movimiento se ve siempre igual sin
// importar el navegador.
const EMPTY_IMG = typeof Image !== "undefined"
  ? Object.assign(new Image(), { src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7" })
  : null;

export function useDragGhost() {
  const [preview, setPreview] = useState(null);

  const start = useCallback((label, e) => {
    if (EMPTY_IMG) e.dataTransfer.setDragImage(EMPTY_IMG, 0, 0);
    setPreview({ label, x: e.clientX, y: e.clientY });
  }, []);

  const move = useCallback((e) => {
    if (!e.clientX && !e.clientY) return; // último "drag" al soltar a veces llega en (0,0)
    setPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
  }, []);

  const end = useCallback(() => setPreview(null), []);

  // Red de seguridad: si el elemento arrastrado desaparece del DOM justo al
  // soltar (ej. cambia de tipificado y React ya no lo dibuja en su columna
  // vieja), el navegador puede no llegar a disparar "dragend" sobre él, y la
  // etiqueta se queda pegada. Escuchando en la ventana entera, esto la
  // apaga siempre, sin importar en qué componente se soltó.
  useEffect(() => {
    function clear() { setPreview(null); }
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  return { preview, start, move, end };
}
