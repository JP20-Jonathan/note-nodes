import { useEffect, useRef } from "react";
import { markdownToEditableHtml, editableHtmlToMarkdown } from "./miniMarkdown.jsx";

// Input de texto "controlado" (value/onChange, como cualquier <textarea>)
// que además deja ver la negrilla en vivo (Cmd/Ctrl+B) en vez de
// **asteriscos** crudos — mismo mini-markdown que ClipboardComposer/
// FloatingNote (ver miniMarkdown.jsx). Reusado por los campos "Notas
// (opcional)" de un pendiente y de un subpendiente.
//
// El reto de contentEditable + React: si el DOM se reescribiera en CADA
// render a partir de `value`, el cursor saltaría al principio en cada
// tecla. Acá el DOM se siembra una vez al montar y de ahí en más es dueño
// de sí mismo; solo se vuelve a sembrar cuando `value` cambia por una razón
// DISTINTA a que este mismo componente lo haya emitido (ej. un formulario
// que reemplaza el valor desde afuera, como "Continuar borrador" en
// ItemFormModal) — lastEmittedRef es la forma de distinguir ambos casos.
export function RichTextField({ value, onChange, placeholder, className, minHeight }) {
  const editorRef = useRef(null);
  const lastEmittedRef = useRef(value);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = markdownToEditableHtml(value);
    // Solo al montar: siembra inicial. Los cambios posteriores del usuario
    // no deben volver a disparar esto (ver el otro efecto, más abajo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    if (!editorRef.current) return;
    editorRef.current.innerHTML = markdownToEditableHtml(value);
    lastEmittedRef.current = value;
  }, [value]);

  function emitChange() {
    if (!editorRef.current) return;
    const text = editableHtmlToMarkdown(editorRef.current);
    lastEmittedRef.current = text;
    onChange(text);
  }

  function handleKeyDown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.execCommand("bold");
      emitChange();
    }
  }

  return (
    <div
      ref={editorRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      onInput={emitChange}
      onKeyDown={handleKeyDown}
      onBlur={emitChange}
      data-placeholder={placeholder}
      style={minHeight ? { minHeight } : undefined}
    />
  );
}
