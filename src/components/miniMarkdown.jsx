// Subconjunto mínimo de markdown, a propósito: solo **negrilla** y líneas
// "- " como lista — alcanza para que ClipboardComposer sea legible sin
// necesitar una librería de markdown completa. Se reusa también en
// FloatingNote.jsx: si no se reusara, una nota normal con ** o "- " dentro
// (ej. un texto que pasó por el composer y se convirtió a nota) mostraría
// los asteriscos/guiones literales en vez de negrilla/lista.
// Un asterisco literal que el usuario escribió o pegó (ej. texto que ya
// traía markdown de otro lado, como notas de Platzi) se escapa a "\*" al
// convertir el DOM a este mini-markdown (ver inlineToMarkdown) — así nunca
// se confunde con el marcador de negrilla al volver a interpretarse. Acá se
// revierte ese escape para mostrarlo como el asterisco simple que es.
function unescapeLiteralStars(s) {
  return s.replace(/\\\*/g, "*");
}

function renderLineInline(line, keyPrefix) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  if (parts.length === 0) return [""];
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{unescapeLiteralStars(part.slice(2, -2))}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{unescapeLiteralStars(part)}</span>;
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

export function escapeHtml(s) {
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
    // El reemplazo de negrilla va ANTES de revertir el escape de asteriscos
    // literales: mientras siguen como "\*" (con la barra de por medio) no
    // forman un "**" válido, así que el regex de negrilla no los toca —
    // unescapeLiteralStars se aplica al final, ya fuera de su alcance.
    const content = unescapeLiteralStars(
      escapeHtml(raw).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    );
    html += isBullet ? `<li>${content}</li>` : `<div>${content || "<br>"}</div>`;
  });
  if (inList) html += "</ul>";
  return html;
}

// Un "*" suelto que el usuario escribió o pegó (ej. texto que ya traía
// markdown de otro lado) se escapa a "\*" para que markdownToEditableHtml
// nunca lo confunda con el marcador de negrilla — mismo escape que usa el
// markdown de verdad para un asterisco literal.
function escapeLiteralStars(s) {
  return s.replace(/\*/g, "\\*");
}

// Markdown de UN nodo inline (texto, o un elemento como <b>/<strong>/<br>) —
// no de sus hijos: el nodo mismo puede ser el texto, o envolverlo en **.
function inlineToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeLiteralStars(node.textContent);
  const tag = node.nodeName;
  const inner = Array.from(node.childNodes).map(inlineToMarkdown).join("");
  if (tag === "B" || tag === "STRONG") {
    // Shift+Enter con negrilla activa deja un <br> ADENTRO del <b> (a
    // diferencia de Enter normal, que abre un <div> nuevo afuera) — para el
    // usuario ambos son "pasar al siguiente renglón", así que acá no se deja
    // un "\n" suelto dentro de un único "**...**" (eso rompe el par al
    // volver a renderizar línea por línea: ver renderInlineMarkdown). Se
    // cierra y reabre el "**" en cada lado del salto, una línea = un par.
    return inner.split("\n").map((part) => (part ? `**${part}**` : "")).join("\n");
  }
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
    // Una línea vacía la sembró markdownToEditableHtml como <div><br></div>
    // (ver más abajo, `content || "<br>"`) — es UNA línea en blanco, no "un
    // salto de línea adentro de otro": si se cae al inlineToMarkdown(node)
    // genérico de más abajo, ese BR solitario se traduce a "\n" y queda
    // pusheado como una línea que en sí misma ya es un salto — al unirse
    // con join("\n") se duplica el blanco. Cada vez que la nota se guarda y
    // se vuelve a abrir, esto doblaba las líneas en blanco de la nota.
    if (onlyChild && onlyChild.nodeName === "BR") { lines.push(""); return; }
    lines.push(inlineToMarkdown(node));
  });
  if (currentLine) flush();
  return lines.join("\n");
}
