import { useEffect, useRef, useState } from "react";
import { markdownToEditableHtml, editableHtmlToMarkdown, escapeHtml } from "../miniMarkdown.jsx";
import { CATEGORIES } from "../../data/categories.js";
import { TIPIFICADOS } from "../../data/tipificados.js";

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
// para guardar el borrador o convertir a pendiente — nunca lo reescribimos
// desde React mientras se edita.
const DRAFT_KEY = "nn-clipboard-draft";
const DEFAULT_CATEGORY = CATEGORIES[0].id; // "sin_categorizar"
const DEFAULT_TIPIFICADO = "sin_tipificar";
// Cuánto esperar sin teclear antes de mandar el borrador a la base — no en
// cada tecla, para no saturar de escrituras; igual se fuerza un guardado
// inmediato (sin esperar este plazo) al perder foco, minimizar o convertir.
const SAVE_DEBOUNCE_MS = 600;

function loadDraft() {
  try { return localStorage.getItem(DRAFT_KEY) || ""; } catch (e) { return ""; }
}

// El primer renglón CON TEXTO es el nombre del pendiente (sin marcado —
// **negrilla**/"- " no tendría sentido en un nombre de una sola línea); el
// resto queda tal cual, marcado incluido, como la nota opcional. Se ignoran
// renglones en blanco al principio (ej. un Enter de más antes de escribir,
// fácil que pase sin darse cuenta en un composer que no se ve de arriba a
// abajo) — si no, lines[0] queda vacío, name también, y handleConvert
// corta en seco sin crear nada ni avisar nada (el botón se siente "inerte").
function splitComposerText(markdown) {
  const lines = markdown.split("\n");
  const firstContentIdx = lines.findIndex((l) => l.trim() !== "");
  if (firstContentIdx === -1) return { name: "", notes: null };
  const name = lines[firstContentIdx].replace(/^- /, "").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
  const notes = lines.slice(firstContentIdx + 1).join("\n").trim();
  return { name, notes: notes || null };
}

export function ClipboardComposer({ draft, onSaveDraft, onConvert }) {
  const [collapsed, setCollapsed] = useState(true);
  const [hasContent, setHasContent] = useState(() => !!(draft?.text || loadDraft()).trim());
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [tipificado, setTipificado] = useState(DEFAULT_TIPIFICADO);
  const [deadline, setDeadline] = useState("");
  const [showDeadline, setShowDeadline] = useState(false);
  const [convertError, setConvertError] = useState(null);
  const editorRef = useRef(null);
  const seededRef = useRef(false);
  const saveTimerRef = useRef(null);

  // Sembrar el editor con el borrador guardado — una sola vez cada vez que
  // se despliega (no en cada render: eso sí pisaría lo que el usuario está
  // escribiendo). La base manda sobre localStorage: si ya cargó un borrador
  // de la base (aunque esté vacío), se usa ese; solo se cae a localStorage
  // si todavía no hay nada en la base para este usuario.
  useEffect(() => {
    if (collapsed || seededRef.current || !editorRef.current) return;
    const text = draft ? draft.text : loadDraft();
    editorRef.current.innerHTML = markdownToEditableHtml(text);
    seededRef.current = true;
  }, [collapsed, draft]);

  // Al desmontar (navegación fuera de la app, por ejemplo) no dejar un
  // guardado pendiente colgado.
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  function currentText() {
    return editorRef.current ? editableHtmlToMarkdown(editorRef.current) : "";
  }

  // localStorage se actualiza al instante (barato, sin red) como caché de
  // respaldo, aparte del guardado en la base.
  function syncLocal() {
    if (!editorRef.current) return "";
    const text = currentText();
    setHasContent(!!text.trim());
    try {
      if (text.trim()) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* sin persistencia esta vez */ }
    return text;
  }

  // Tecleo normal: no se manda a la base en cada tecla (saturaría de
  // escrituras) — se agenda con debounce, y solo se corta esa espera en los
  // puntos donde de verdad importa no perder nada (ver flushSave).
  function persistDraft() {
    if (convertError) setConvertError(null);
    const text = syncLocal();
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; onSaveDraft?.(text); }, SAVE_DEBOUNCE_MS);
  }

  function flushSave() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    onSaveDraft?.(currentText());
  }

  // Para acciones puntuales (negrilla, lista, pegar): a diferencia de
  // tecleo continuo, son eventos discretos y poco frecuentes, así que no
  // tiene sentido hacerlas esperar el debounce.
  function flushNow() {
    syncLocal();
    flushSave();
  }

  // Sin esto, el navegador pega el HTML tal cual venga del origen (otra
  // página, Word, incluso otra nota de acá) — con sus propios colores/
  // estilos inline, que pueden quedar invisibles o rotos sobre el fondo
  // claro del composer. Se fuerza a texto plano, línea por línea con <br>
  // reales entre ellas (un solo execCommand("insertText", ...) con "\n"
  // adentro del string no garantiza saltos de línea reales en todos los
  // navegadores).
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const html = text.split("\n").map(escapeHtml).join("<br>");
    document.execCommand("insertHTML", false, html);
    flushNow();
  }

  function handleKeyDown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.execCommand("bold");
      flushNow();
    }
  }

  function toggleList() {
    editorRef.current?.focus();
    document.execCommand("insertUnorderedList");
    flushNow();
  }
  function toggleBold() {
    editorRef.current?.focus();
    document.execCommand("bold");
    flushNow();
  }

  function handleMinimize() {
    flushSave();
    // Minimizar desmonta el <div> del editor (pasa a renderizar el botón
    // colapsado) — al reabrir se crea un contentEditable NUEVO y vacío, así
    // que hay que permitir que se vuelva a sembrar con el borrador actual
    // (si no, seededRef se queda en true para siempre y el texto nunca
    // vuelve a aparecer, aunque sí esté guardado).
    seededRef.current = false;
    setCollapsed(true);
  }

  function handleConvert() {
    if (!editorRef.current) return;
    const { name, notes } = splitComposerText(editableHtmlToMarkdown(editorRef.current));
    if (!name) { setConvertError("Escribe algo para convertir en pendiente."); return; }
    setConvertError(null);
    onConvert({ name, notes, category, tipificado, deadline: showDeadline && deadline ? deadline : null });
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    editorRef.current.innerHTML = "";
    seededRef.current = true; // ya está vacío a propósito, no volver a sembrar
    setHasContent(false);
    setCategory(DEFAULT_CATEGORY);
    setTipificado(DEFAULT_TIPIFICADO);
    setDeadline("");
    setShowDeadline(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* sin persistencia esta vez */ }
    onSaveDraft?.(""); // borra la fila is_draft en la base — queda limpio para la próxima nota
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
        <button type="button" className="clipboard-composer-min" onClick={handleMinimize} title="Minimizar">—</button>
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
        onPaste={handlePaste}
        onBlur={flushSave}
        data-placeholder={"Escribe acá lo que quieras..."}
      />
      {convertError && <p className="field-error">{convertError}</p>}
      <div className="clipboard-composer-footer">
        <div className="clipboard-composer-fields">
          <select className="clipboard-composer-select" value={category} onChange={(e) => setCategory(e.target.value)} title="Categoría">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="clipboard-composer-select" value={tipificado} onChange={(e) => setTipificado(e.target.value)} title="Tipificado">
            {TIPIFICADOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {showDeadline ? (
            <span className="clipboard-composer-date">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <button type="button" onClick={() => { setDeadline(""); setShowDeadline(false); }} title="Quitar fecha">✕</button>
            </span>
          ) : (
            <button type="button" className="clipboard-composer-date-btn" onClick={() => setShowDeadline(true)} title="Agregar fecha límite">
              📅
            </button>
          )}
        </div>
        <button type="button" className="clipboard-composer-check" onClick={handleConvert} disabled={!hasContent} title="Convertir en pendiente">
          ✓
        </button>
      </div>
    </div>
  );
}
