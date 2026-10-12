// Subconjunto mínimo de markdown, a propósito: solo **negrilla** y líneas
// "- " como lista — alcanza para que ClipboardComposer sea legible sin
// necesitar una librería de markdown completa. Se reusa también en
// FloatingNote.jsx: si no se reusara, una nota normal con ** o "- " dentro
// (ej. un texto que pasó por el composer y se convirtió a nota) mostraría
// los asteriscos/guiones literales en vez de negrilla/lista.
function renderLineInline(line, keyPrefix) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  if (parts.length === 0) return [""];
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function renderInlineMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const blocks = [];
  let currentList = null;
  lines.forEach((line, idx) => {
    if (line.startsWith("- ")) {
      if (!currentList) { currentList = []; blocks.push({ type: "ul", items: currentList }); }
      currentList.push(renderLineInline(line.slice(2), `li-${idx}`));
    } else {
      currentList = null;
      blocks.push({ type: "line", content: renderLineInline(line, `ln-${idx}`), key: idx });
    }
  });
  return blocks.map((b, i) => {
    if (b.type === "ul") {
      return (
        <ul key={`ul-${i}`} style={{ margin: "2px 0", paddingLeft: 18 }}>
          {b.items.map((item, ii) => <li key={ii}>{item}</li>)}
        </ul>
      );
    }
    return <div key={`ln-${b.key}`}>{b.content.length ? b.content : " "}</div>;
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Mismo mini-markdown, pero a HTML (string) en vez de elementos React — para
// sembrar el contentEditable de ClipboardComposer con el borrador guardado.
// Solo se usa una vez, al abrir el composer; de ahí en más el navegador es
// dueño de ese DOM (ver comentario en ClipboardComposer.jsx sobre por qué
// no se re-renderiza con React mientras se escribe).
export function markdownToEditableHtml(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  lines.forEach((line) => {
    const isBullet = line.startsWith("- ");
    if (isBullet && !inList) { html += "<ul>"; inList = true; }
    if (!isBullet && inList) { html += "</ul>"; inList = false; }
    const raw = isBullet ? line.slice(2) : line;
    const content = escapeHtml(raw).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html += isBullet ? `<li>${content}</li>` : `<div>${content || "<br>"}</div>`;
  });
  if (inList) html += "</ul>";
  return html;
}

// Markdown de UN nodo inline (texto, o un elemento como <b>/<strong>/<br>) —
// no de sus hijos: el nodo mismo puede ser el texto, o envolverlo en **.
function inlineToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  const tag = node.nodeName;
  const inner = Array.from(node.childNodes).map(inlineToMarkdown).join("");
  if (tag === "B" || tag === "STRONG") return `**${inner}**`;
  if (tag === "BR") return "\n";
  return inner;
}

// El reverso de markdownToEditableHtml — lee el DOM que el navegador fue
// armando mientras el usuario escribía/usó negrilla o listas (execCommand)
// y lo serializa de vuelta al mismo mini-markdown en texto plano, para
// guardarlo como borrador o convertirlo en una nota real (mismo formato que
// ya usa notes.text en toda la app).
//
// OJO con la primera línea: antes del primer Enter, el navegador NO envuelve
// el texto en un <div> — el texto suelto y cualquier <b> quedan como
// hermanos directos de root (ej. "Texto " + <b>importante</b>). Por eso acá
// no se trata "cada hijo de root = una línea": el contenido inline a nivel
// raíz se va acumulando en currentLine, y solo se corta una línea nueva al
// toparse con un bloque real (<div>/<ul>), que si no se perdería la negrilla
// de la primera línea o se partiría en líneas de más.
export function editableHtmlToMarkdown(root) {
  const lines = [];
  let currentLine = "";
  function flush() { lines.push(currentLine); currentLine = ""; }

  root.childNodes.forEach((node) => {
    const isBlock = node.nodeType === Node.ELEMENT_NODE && ["DIV", "P", "UL", "OL"].includes(node.nodeName);
    if (!isBlock) { currentLine += inlineToMarkdown(node); return; }

    if (currentLine) flush();
    if (node.nodeName === "UL" || node.nodeName === "OL") {
      Array.from(node.children).forEach((li) => lines.push(`- ${inlineToMarkdown(li)}`));
      return;
    }
    // Chrome envuelve una línea recién "listificada" (execCommand
    // insertUnorderedList) como <div><ul><li>...</li></ul></div> — si el
    // bloque solo contiene una lista, se procesa como tal en vez de texto.
    const onlyChild = node.childNodes.length === 1 ? node.childNodes[0] : null;
    if (onlyChild && (onlyChild.nodeName === "UL" || onlyChild.nodeName === "OL")) {
      Array.from(onlyChild.children).forEach((li) => lines.push(`- ${inlineToMarkdown(li)}`));
      return;
    }
    lines.push(inlineToMarkdown(node));
  });
  if (currentLine) flush();
  return lines.join("\n");
}
