import { useEffect, useRef, useState } from "react";
import { markdownToEditableHtml, editableHtmlToMarkdown } from "../miniMarkdown.jsx";

// "Nota rápida" tipo portapapeles — vive FUERA del grafo (fixed al viewport),
// pensada para el espacio de fondo que hoy no se usa para nada. A diferencia
// de v1 (textarea + botón "Vista previa"), esta es un contentEditable real:
// la negrilla (Cmd/Ctrl+B) y las listas se VEN formateadas mientras se
// escribe, no hay que alternar a una vista aparte para comprobarlo.
//
// Por qué contentEditable no se controla con React en cada tecla: si el
// contenido (children/innerHTML) se re-renderizara desde el estado de React
// en cada cambio, el cursor saltaría al principio cada vez (problema clásico
// de contentEditable + React). En cambio, el DOM adentro del editor es
// "dueño de sí mismo" una vez sembrado (markdownToEditableHtml, una sola vez
// al abrir): el navegador lo muta libremente (incluida la negrilla vía
// execCommand), y solo LEEMOS ese DOM hacia afuera (editableHtmlToMarkdown)
// para guardar el borrador o convertir a nota — nunca lo reescribimos desde
// React mientras se edita.
const DRAFT_KEY = "nn-clipboard-draft";

function loadDraft() {
  try { return localStorage.getItem(DRAFT_KEY) || ""; } catch (e) { return ""; }
}

export function ClipboardComposer({ onConvert }) {
  const [collapsed, setCollapsed] = useState(true);
  const [hasContent, setHasContent] = useState(() => !!loadDraft().trim());
  const editorRef = useRef(null);
  const seededRef = useRef(false);

  // Sembrar el editor con el borrador guardado — una sola vez, la primera
  // vez que se despliega (no en cada render: eso sí pisaría lo que el
  // usuario está escribiendo).
  useEffect(() => {
    if (collapsed || seededRef.current || !editorRef.current) return;
    editorRef.current.innerHTML = markdownToEditableHtml(loadDraft());
    seededRef.current = true;
  }, [collapsed]);

  function persistDraft() {
    if (!editorRef.current) return;
    const text = editableHtmlToMarkdown(editorRef.current);
    setHasContent(!!text.trim());
    try {
      if (text.trim()) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* sin persistencia esta vez */ }
  }

  function handleKeyDown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.execCommand("bold");
      persistDraft();
    }
  }

  function toggleList() {
    editorRef.current?.focus();
    document.execCommand("insertUnorderedList");
    persistDraft();
  }
  function toggleBold() {
    editorRef.current?.focus();
    document.execCommand("bold");
    persistDraft();
  }

  function handleConvert() {
    if (!editorRef.current) return;
    const text = editableHtmlToMarkdown(editorRef.current);
    if (!text.trim()) return;
    onConvert(text);
    editorRef.current.innerHTML = "";
    seededRef.current = true; // ya está vacío a propósito, no volver a sembrar
    setHasContent(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* sin persistencia esta vez */ }
    setCollapsed(true);
  }

  if (collapsed) {
    return (
      <button type="button" className="clipboard-composer-tab" onClick={() => setCollapsed(false)}>
        📋 Nota rápida{hasContent ? " •" : ""}
      </button>
    );
  }

  return (
    <div className="clipboard-composer">
      <div className="clipboard-composer-clip" />
      <div className="clipboard-composer-head">
        <span>Nota rápida</span>
        <button type="button" className="clipboard-composer-min" onClick={() => setCollapsed(true)} title="Minimizar">—</button>
      </div>
      <div className="clipboard-composer-toolbar">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={toggleBold} title="Negrilla (Cmd/Ctrl+B)"><strong>N</strong></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={toggleList} title="Lista">• Lista</button>
      </div>
      <div
        ref={editorRef}
        className="clipboard-composer-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={persistDraft}
        onKeyDown={handleKeyDown}
        onBlur={persistDraft}
        data-placeholder={"Escribe acá lo que quieras..."}
      />
      <button type="button" className="clipboard-composer-check" onClick={handleConvert} disabled={!hasContent} title="Convertir en nota">
        ✓
      </button>
    </div>
  );
}
