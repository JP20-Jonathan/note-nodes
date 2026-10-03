// ===========================================================
// ForceGraph — D3 (v7): colisión, arrastre, foco, urgencia y clic
// ===========================================================
// Consume { nodes, links } tal como los entrega useArbolViewModel,
// sin JSX ni DOM en esa capa. D3 se usa para calcular físicas
// (forceSimulation) y para el gesto de arrastre (d3.drag) — lo
// único verdaderamente imperativo, porque un arrastre multi-evento
// (down/move/up, con inercia y umbral) no tiene forma declarativa
// razonable en React. Todo lo demás (círculos, líneas, texto) lo
// sigue dibujando React, leyendo las posiciones que D3 va
// escribiendo en una copia local mutable (así no se ensucian los
// objetos inmutables que entrega el hook).
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

// Corta el texto para que nunca desborde el nodo — solo afecta
// lo que se pinta, no el label real que guarda useArbolViewModel.
function truncateLabel(label, maxChars) {
  if (!label || label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 1)}…`;
}

const LABEL_STYLE_BY_TYPE = {
  sun: { maxChars: 16, fontSize: 13, fontWeight: 700 },
  category: { maxChars: 16, fontSize: 11, fontWeight: 600 },
  project: { maxChars: 14, fontSize: 9.5, fontWeight: 500 },
  item: { maxChars: 12, fontSize: 8.5, fontWeight: 400 },
};

// Receta estándar de D3 para conectar el gesto de arrastre con la
// simulación: al empezar, "recalienta" (alphaTarget) y fija el
// nodo (fx/fy) a donde está el mouse; al soltar, lo libera para
// que las fuerzas lo vuelvan a gobernar. dragStateRef.moved es lo
// que nos permite distinguir un clic de un arrastre (mismo patrón
// que ya usa FloatingNote con su bandera "moved").
function makeDragBehavior(simulation, dragStateRef) {
  function dragstarted(event, d) {
    // Sin esto, arrastrar un nodo también movería el lienzo entero (el
    // mousedown burbujea hasta el <svg>, donde vive el paneo de d3.zoom).
    event.sourceEvent.stopPropagation();
    // 0.22 en vez del 0.3 anterior: recalienta lo justo para que el resto de
    // la red reaccione al arrastre sin ponerse a temblar de forma errática.
    if (!event.active) simulation.alphaTarget(0.22).restart();
    dragStateRef.current.moved = false;
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    dragStateRef.current.moved = true;
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

// Color/brillo de un item según el mismo agrupamiento que ya usa el
// Tablero (tipificado), no la cercanía de la fecha límite — así el árbol y
// el Tablero cuentan la misma historia con el mismo color de un vistazo.
// Atrasado titila en rojo (.node-pulse-red) porque nadie lo reasignó a
// tiempo y necesita una acción manual; "urgentes" es una prioridad fijada
// a mano, se ve igual de roja pero fija, para no confundir ambas señales.
// esta_semana/siguientes_actividades titilan verde/amarillo para leerse
// como "activo ahora" (ver .node-pulse-* en index.css).
function itemGlowStyle(meta) {
  if (!meta) return null;
  if (meta.overdue) {
    return { stroke: "var(--glow-urgent-red)", strokeWidth: 3, filter: "drop-shadow(0 0 7px var(--glow-urgent-red))", pulseClass: "node-pulse-red" };
  }
  if (meta.tipificado === "urgentes") {
    return { stroke: "var(--glow-urgent-red)", strokeWidth: 3, filter: "drop-shadow(0 0 7px var(--glow-urgent-red))", pulseClass: null };
  }
  if (meta.tipificado === "importantisimas") {
    return { stroke: "var(--sema-red)", strokeWidth: 2, filter: "drop-shadow(0 0 4px var(--sema-red))", pulseClass: null };
  }
  if (meta.tipificado === "esta_semana") {
    return { stroke: "var(--glow-active-green)", strokeWidth: 2, filter: null, pulseClass: "node-pulse-green" };
  }
  if (meta.tipificado === "siguientes_actividades") {
    return { stroke: "var(--sema-yellow)", strokeWidth: 2, filter: null, pulseClass: "node-pulse-yellow" };
  }
  return null;
}

// Cuánto crece el nodo que se acaba de tocar (categoría o proyecto), para
// que se note claramente cuál es sin necesitar leer la etiqueta primero.
const FOCUS_GROWTH = 1.25;
// Espacio extra de colisión para una rama abierta (ver el force "collide"
// más abajo) — suficiente para que sus tarjetas de texto (~130px de ancho)
// no invadan el clúster de una rama vecina también abierta.
const FULL_BRANCH_COLLISION_PADDING = 90;

// Los nodos enfocados (clic en categoría/proyecto — se puede tener varios a
// la vez, ver handleNodeClick) y toda su rama — ancestros hasta el sol, y
// descendientes hasta los items — quedan "en foco"; el resto se atenúa.
// null = sin foco, todo visible por igual. Con varias ramas abiertas, el
// resultado es la UNIÓN de cada una (así se puede comparar BMW y CESDE a la
// vez sin que una tape a la otra).
function computeFocusSet(nodes, focusedNodeIds) {
  if (!focusedNodeIds || focusedNodeIds.size === 0) return null;
  const byNodeId = {};
  nodes.forEach((n) => { byNodeId[n.id] = n; });
  const related = new Set();
  focusedNodeIds.forEach((focusedNodeId) => {
    let ancestor = byNodeId[focusedNodeId];
    while (ancestor) { related.add(ancestor.id); ancestor = ancestor.parentId ? byNodeId[ancestor.parentId] : null; }
  });
  nodes.forEach((n) => {
    let p = n;
    while (p) {
      if (focusedNodeIds.has(p.id)) { related.add(n.id); break; }
      p = p.parentId ? byNodeId[p.parentId] : null;
    }
  });
  return related;
}

// ===========================================================
// Estética "red neuronal de datos" — helpers puramente visuales.
// Nada de esto toca física, foco ni estados: solo cómo se pinta
// lo que D3 ya calculó.
// ===========================================================
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}
function rgbToHex(r, g, b) {
  return `#${((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1)}`;
}
// Mezcla el color propio de la categoría con un tono azul/plateado — así
// las gemas quedan iluminadas "desde dentro" en la paleta sci-fi pedida,
// sin perder del todo la identidad de color de cada categoría.
function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function gemGradientId(nodeId) {
  return `gem-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

// Cada nivel jerárquico tiene su propia silueta — no solo su tamaño — para
// que se reconozca de un vistazo qué es cada gema sin tener que leer la
// etiqueta primero. El sol se renderiza aparte como óvalo (ver <ellipse> en
// el render, no aquí) porque siempre fue el ancla del árbol y así lucía
// antes; esta función solo cubre categoría (hexágono) y proyecto (rombo
// alargado). Devuelve los vértices [x,y]; de ahí salen el <polygon> y sus
// líneas de faceta.
function shapeVertices(type, cx, cy, r) {
  if (type === "project") {
    return [
      [cx, cy - r * 1.15],
      [cx + r * 0.72, cy],
      [cx, cy + r * 1.15],
      [cx - r * 0.72, cy],
    ];
  }
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    verts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return verts;
}
function shapePointsStr(verts) {
  return verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// La mezcla hacia azul/plateado es "leve" (ratios bajos): el color propio
// de cada categoría debe seguir siendo lo primero que se reconoce — el
// tono frío solo le da el acabado de cristal, no reemplaza la identidad.
const GEM_HIGHLIGHT = "#EAF6FF";
const GEM_MID = "#6FA8DC";
const GEM_SHADOW = "#0A1622";
const GEM_GLOW_FILTER = {
  category: "drop-shadow(0 0 8px rgba(100,181,255,0.32))",
  project: "drop-shadow(0 0 5px rgba(100,181,255,0.22))",
};

// El sol cambia de color (y a veces titila) según cuántos pendientes de
// "esta semana" hay activos ahora mismo — es la señal de "¿ya preparé mi
// semana?": rojo fijo si hay demasiados (sobrecarga, no hace falta que
// titile para notarse); verde titilando si el rango es sano (3-7); amarillo
// titilando si hay muy pocos o ninguno (2 o menos — probablemente la semana
// todavía no se preparó). 8-10 queda en el dorado neutro de siempre, con la
// misma respiración suave de fondo que ya tenía.
function sunLoadStyle(weekCount) {
  const n = weekCount || 0;
  if (n > 10) return { color: "#FF4D42", pulseClass: null };
  if (n >= 3 && n <= 7) return { color: "#4ADE80", pulseClass: "node-pulse-sun-green" };
  if (n <= 2) return { color: "#EAC54F", pulseClass: "node-pulse-sun-yellow" };
  return { color: "#F5D67B", pulseClass: "node-pulse-sun" };
}
function sunGlowFilter(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `drop-shadow(0 0 14px rgba(${r},${g},${b},0.5))`;
}

// Distancia jerárquica de los enlaces: el tronco (sol→categoría) necesita
// más aire que una rama corta, para que las categorías no amontonen sus
// propios proyectos unas sobre otras.
function linkDistance(targetType) {
  if (targetType === "item") return 42;
  if (targetType === "project") return 64;
  return 130;
}

// Grosor jerárquico de las "sinapsis": tronco (sol→categoría) grueso y con
// resplandor real (filter), rama (categoría→proyecto) media, hoja
// (→ítem) delgada. Cada nivel se dibuja en capas superpuestas con
// distinta opacidad para simular un haz de fibra óptica, no una sola línea.
const LINK_TIER_STYLE = {
  trunk: { core: 5, glow: 13, coreColor: "#9FE0FF", midColor: "#4FA8F5", glowColor: "#1668D6", useFilter: true, flowDur: "2.2s" },
  branch: { core: 3, glow: 8, coreColor: "#8FD0FA", midColor: "#3D8EE0", glowColor: "#0F4FA8", useFilter: false, flowDur: "1.6s" },
  leaf: { core: 1.5, glow: 4, coreColor: "#7FC2F0", midColor: null, glowColor: "#0B3B80", useFilter: false, flowDur: "1.1s" },
};
function linkTier(targetType) {
  if (targetType === "item") return "leaf";
  if (targetType === "project") return "branch";
  return "trunk";
}
function linkGradientId(index) {
  return `link-flow-${index}`;
}

// Tarjetas flotantes (glassmorphism) para los ítems — ancho fijo, alto
// estimado por longitud de texto para que el label completo (sin truncar)
// quepa en varias líneas sin desbordar el panel HTML.
const ITEM_CARD_WIDTH = 130;
function estimateItemCardHeight(label) {
  const charsPerLine = 19;
  const lines = Math.min(6, Math.max(1, Math.ceil((label || "").length / charsPerLine)));
  return 20 + lines * 13;
}

// Nivel de detalle de un ítem — no hay que ver todo el árbol a la vez.
// En la vista general, cada ítem es un punto pequeño (barato de pintar,
// legible sin amontonarse). Solo se expande a la tarjeta completa con
// todo el texto cuando el usuario "entra" a esa rama (foco por clic) o
// hace zoom manual sobre esa zona — igual que pedía la referencia.
const ITEM_ZOOM_THRESHOLD = 1.7;
function itemDetailLevel(node, focusedNodeIds, focusSet, zoomScale) {
  if (focusedNodeIds && focusedNodeIds.size > 0) return focusSet && focusSet.has(node.id) ? "full" : "compact";
  return zoomScale >= ITEM_ZOOM_THRESHOLD ? "full" : "compact";
}

// La física (forceCollide) solo evita que los ANCLAS de los nodos se
// toquen — no sabe nada del tamaño real de una tarjeta de texto. Por eso,
// cuando varios ítems del mismo padre están en detalle "full" a la vez,
// se acomodan en una columna/fila explícita (no simulada) según su alto
// real, para que ninguna tarjeta quede encima de otra. sign/horizontal
// se calculan según hacia dónde "crece" el padre respecto a su propio
// padre, así la columna sigue fluyendo hacia afuera del árbol.
//
// Nota: se probó una variante en espiral (tarjetas "orbitando" al nodo en
// vez de en fila) y se revirtió a pedido explícito — la fila ordenada se
// lee mejor para comparar actividades por categoría de un vistazo.
const ITEM_LIST_GAP = 8;
const ITEM_NODE_GAP = 28;
function layoutItemGroup(parent, items, grandparent, parentRadius) {
  const dx = grandparent ? parent.x - grandparent.x : 1;
  const dy = grandparent ? parent.y - grandparent.y : 0;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sign = horizontal ? (dx >= 0 ? 1 : -1) : (dy >= 0 ? 1 : -1);
  const heights = items.map((n) => estimateItemCardHeight(n.label));
  const positions = {};
  if (horizontal) {
    const totalHeight = heights.reduce((a, b) => a + b, 0) + ITEM_LIST_GAP * (items.length - 1);
    const cardCenterX = parent.x + sign * (parentRadius + ITEM_NODE_GAP + ITEM_CARD_WIDTH / 2);
    let cursor = parent.y - totalHeight / 2;
    items.forEach((n, i) => {
      const h = heights[i];
      const cy = cursor + h / 2;
      positions[n.id] = {
        cx: cardCenterX, cy, w: ITEM_CARD_WIDTH, h,
        anchorX: cardCenterX - sign * (ITEM_CARD_WIDTH / 2), anchorY: cy,
      };
      cursor += h + ITEM_LIST_GAP;
    });
  } else {
    const totalWidth = items.length * ITEM_CARD_WIDTH + ITEM_LIST_GAP * (items.length - 1);
    let cursor = parent.x - totalWidth / 2;
    items.forEach((n, i) => {
      const h = heights[i];
      const cardCenterY = parent.y + sign * (parentRadius + ITEM_NODE_GAP + h / 2);
      const cx = cursor + ITEM_CARD_WIDTH / 2;
      positions[n.id] = {
        cx, cy: cardCenterY, w: ITEM_CARD_WIDTH, h,
        anchorX: cx, anchorY: cardCenterY - sign * (h / 2),
      };
      cursor += ITEM_CARD_WIDTH + ITEM_LIST_GAP;
    });
  }
  return positions;
}

export function ForceGraph({ nodes, links, byId, onNodeClick, onNodeDoubleClick }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const simNodesRef = useRef([]);
  const simLinksRef = useRef([]);
  const dragBehaviorRef = useRef(null);
  const dragStateRef = useRef({ moved: false });
  const transformRef = useRef(d3.zoomIdentity);
  const zoomBehaviorRef = useRef(null);
  const simulationRef = useRef(null);
  const [, bumpTick] = useState(0);
  // Set (no un solo id): se pueden tener varias ramas abiertas al mismo
  // tiempo — clic en una categoría/proyecto la agrega o la quita del set en
  // vez de reemplazar lo que ya estaba abierto (ver handleNodeClick).
  const [focusedNodeIds, setFocusedNodeIds] = useState(() => new Set());
  const focusedNodeIdsRef = useRef(focusedNodeIds);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [size, setSize] = useState({ width: 880, height: 560 });

  // La física de colisión (abajo) lee esta ref en cada tick para darle más
  // espacio a una rama abierta con tarjetas completas — así, cuando hay 2+
  // ramas enfocadas a la vez, la propia simulación las empuja separadas en
  // vez de que sus tarjetas de texto se encimen.
  useEffect(() => {
    focusedNodeIdsRef.current = focusedNodeIds;
    if (simulationRef.current) simulationRef.current.alpha(0.35).restart();
  }, [focusedNodeIds]);

  // El lienzo llena el contenedor que le dé App.jsx (normal o expandido a
  // pantalla completa) en vez de un tamaño fijo — así "pantalla completa"
  // solo es cuestión de CSS en el contenedor, este componente se adapta solo.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;

  useEffect(() => {
    const simNodes = nodes.map((n) => ({ ...n }));
    const simLinks = links.map((l) => ({ ...l }));
    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;

    const simulation = d3.forceSimulation(simNodes)
      // velocityDecay más alto que el default (0.4) = fricción extra: la red
      // se asienta más suave y para de temblar antes, en vez de oscilar de
      // un lado a otro cada vez que se suelta o agrega un nodo.
      .velocityDecay(0.45)
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("link", d3.forceLink(simLinks).id((d) => d.id).distance((l) => linkDistance(typeof l.target === "object" ? l.target.type : null)))
      // El radio de colisión de una categoría/proyecto crece mientras esté
      // enfocada (tiene tarjetas de texto completas alrededor) — así, con
      // 2+ ramas abiertas a la vez, la simulación las reparte con espacio de
      // sobra para sus tarjetas en vez de dejar que sus clústeres se
      // encimen. Lee focusedNodeIdsRef (no el estado) para no tener que
      // reconstruir toda la simulación cada vez que cambia el foco.
      .force("collide", d3.forceCollide().radius((d) => {
        const isOpenBranch = (d.type === "category" || d.type === "project") && focusedNodeIdsRef.current.has(d.id);
        return isOpenBranch ? d.radius + 4 + FULL_BRANCH_COLLISION_PADDING : d.radius + 4;
      }))
      .on("tick", () => bumpTick((t) => t + 1));

    simulationRef.current = simulation;
    dragBehaviorRef.current = makeDragBehavior(simulation, dragStateRef);

    return () => simulation.stop();
  }, [nodes, links, width, height]);

  // Paneo y zoom — en un efecto aparte, que solo corre una vez, para que
  // arrastrar/agregar un pendiente (que reconstruye la simulación de arriba)
  // no reinicie la posición de la cámara que el usuario ya movió.
  useEffect(() => {
    const svgSel = d3.select(svgRef.current);
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.25, 4])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        bumpTick((t) => t + 1);
      });

    svgSel.call(zoomBehavior).on("dblclick.zoom", null);
    zoomBehaviorRef.current = zoomBehavior;

    // Con trackpad, 2 dedos se sienten como "mover el lienzo" (paneo), no
    // como zoom — así que reinterpretamos la rueda: Ctrl+rueda (así reporta
    // el navegador un pellizco de trackpad, o Ctrl+scroll con mouse) hace
    // zoom; cualquier otra rueda es paneo natural con deltaX/deltaY.
    // Se registra bajo el mismo namespace ("wheel.zoom") que usa d3.zoom
    // por dentro, para reemplazar su manejo por defecto en vez de sumarle uno.
    //
    // El factor de zoom ya no es un paso fijo por evento (eso hacía que un
    // pellizco de trackpad, que dispara muchos eventos deltaY chicos en
    // ráfaga, se sintiera hipersensible): ahora es proporcional a deltaY, así
    // que un evento grande (rueda de mouse) da un paso visible y una ráfaga
    // de eventos chicos (trackpad) da un zoom continuo y suave.
    // 0.00129375 = 0.001035 * 1.25 — otro 25% más sensible al pellizcar
    // (agrandar y achicar), encima del +15% anterior. Historial: 0.0009 ->
    // 0.001035 (+15%) -> 0.00129375 (+25% más), pedido explícitamente tras
    // probar cada valor.
    const WHEEL_ZOOM_COEF = 0.00129375;
    svgSel.on("wheel.zoom", (event) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_COEF);
        zoomBehavior.scaleBy(svgSel, factor, d3.pointer(event));
      } else {
        const k = transformRef.current.k;
        zoomBehavior.translateBy(svgSel, -event.deltaX / k, -event.deltaY / k);
      }
    });

    return () => svgSel.on(".zoom", null);
  }, []);

  // Los botones +/− usan una transición corta en vez de saltar de golpe al
  // nuevo zoom — con la rueda/pellizco se deja el zoom instantáneo (así
  // responde al ritmo real del gesto), pero un clic sí se beneficia de un
  // paso animado, se siente más intencional y menos brusco.
  function zoomBy(factor) {
    if (!zoomBehaviorRef.current) return;
    const svgSel = d3.select(svgRef.current).transition().duration(260).ease(d3.easeCubicOut);
    zoomBehaviorRef.current.scaleBy(svgSel, factor);
  }

  const simNodes = simNodesRef.current;
  const simLinks = simLinksRef.current;
  const tf = transformRef.current;
  // parentId es estable entre ticks (viene tal cual del hook), así que el
  // set de foco se puede calcular sobre "nodes" (los originales) en vez de
  // recalcularlo por cada tick de la simulación.
  const focusSet = useMemo(() => computeFocusSet(nodes, focusedNodeIds), [nodes, focusedNodeIds]);
  // Posición del nodo padre de cada ítem, para anclar su tarjeta flotante
  // del lado por donde entra el "hilo" — puramente de layout visual.
  const simById = {};
  simNodes.forEach((n) => { simById[n.id] = n; });

  function resolveOriginal(node) {
    return (byId && byId[node.id]) || node;
  }

  // Clic en el sol = quitar todo el foco ("volver"). Clic en categoría/
  // proyecto = alterna esa rama dentro/fuera del set de enfocadas — así se
  // pueden abrir varias a la vez (ej. BMW y CESDE) sin que abrir una cierre
  // la otra; un segundo clic sobre la misma rama la cierra. Clic en un item
  // abre su detalle (via onNodeClick). Si hubo arrastre, el clic que sigue
  // al soltar se ignora (mismo patrón "moved" que ya usa FloatingNote). El
  // objeto que se entrega hacia afuera es siempre el original del hook (vía
  // byId), no el clon con x/y/vx/vy de la simulación — quien escuche
  // onNodeClick no debería ver ruido físico.
  function handleNodeClick(node) {
    if (dragStateRef.current.moved) return;
    const original = resolveOriginal(node);
    if (original.type === "sun") {
      setFocusedNodeIds(new Set());
    } else if (original.type === "category" || original.type === "project") {
      setFocusedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(original.id)) next.delete(original.id);
        else next.add(original.id);
        return next;
      });
    }
    if (typeof onNodeClick === "function") onNodeClick(original);
  }

  // Doble clic en categoría/proyecto: asegura el foco en esa rama (la agrega
  // si no estaba, no la cierra si ya estaba abierta) y avisa hacia afuera
  // (onNodeDoubleClick) para que quien lo use abra el formulario de "nuevo
  // pendiente" ya preseleccionado ahí.
  function handleNodeDoubleClick(node) {
    if (dragStateRef.current.moved) return;
    const original = resolveOriginal(node);
    if (original.type !== "category" && original.type !== "project") return;
    setFocusedNodeIds((prev) => new Set(prev).add(original.id));
    if (typeof onNodeDoubleClick === "function") onNodeDoubleClick(original);
  }

  const gemNodes = simNodes.filter((n) => n.type !== "item" && n.x != null);

  // Posición "de lectura" de cada ítem en detalle completo — no la que
  // calculó la física (esa solo evita que los anclas se toquen), sino un
  // layout explícito por padre (ver layoutItemGroup) para que ninguna
  // tarjeta de texto quede encima de otra. Se recalcula cada render, pero
  // solo recorre los ítems que están en foco/zoom — nunca el árbol entero.
  const itemLayout = {};
  {
    const fullItemsByParent = {};
    simNodes.forEach((n) => {
      if (n.type !== "item" || n.x == null) return;
      if (itemDetailLevel(n, focusedNodeIds, focusSet, tf.k) !== "full") return;
      (fullItemsByParent[n.parentId] = fullItemsByParent[n.parentId] || []).push(n);
    });
    Object.keys(fullItemsByParent).forEach((parentId) => {
      const parent = simById[parentId];
      if (!parent || parent.x == null) return;
      const grandparent = parent.parentId ? simById[parent.parentId] : null;
      const parentRadius = focusedNodeIds.has(parent.id) ? parent.radius * FOCUS_GROWTH : parent.radius;
      Object.assign(itemLayout, layoutItemGroup(parent, fullItemsByParent[parentId], grandparent, parentRadius));
    });
  }

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative" }}>
    <svg
      ref={svgRef} width={width} height={height}
      style={{ background: "#0b0f14", borderRadius: 12, maxWidth: "100%", cursor: "grab", touchAction: "none" }}
      onClick={(e) => { if (e.target === svgRef.current) setFocusedNodeIds(new Set()); }}
    >
      <defs>
        {/* Plano técnico: cuadrícula sutil, fija al SVG (no se mueve con el paneo). */}
        <pattern id="bg-grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(90,140,200,0.10)" strokeWidth={1} />
        </pattern>
        {/* Resplandor real (blur) reservado para el tronco sol→categoría. */}
        <filter id="trunk-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {gemNodes.map((n) => {
          // El sol no usa su n.color fijo para el gradiente — usa el color
          // que le toque según la carga de la semana (ver sunLoadStyle).
          const baseColor = n.type === "sun" ? sunLoadStyle(n.meta && n.meta.weekCount).color : n.color;
          const highlight = mixHex(baseColor, GEM_HIGHLIGHT, 0.4);
          const mid = mixHex(baseColor, GEM_MID, 0.28);
          const shadow = mixHex(baseColor, GEM_SHADOW, 0.55);
          return (
            <radialGradient key={n.id} id={gemGradientId(n.id)} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor={highlight} />
              <stop offset="45%" stopColor={mid} />
              <stop offset="100%" stopColor={shadow} />
            </radialGradient>
          );
        })}
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="url(#bg-grid)" pointerEvents="none" />
      <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>
      <g>
        {simLinks.map((l, i) => {
          const s = l.source, t = l.target;
          if (!s || !t || s.x == null || t.x == null) return null;
          const inFocus = !focusSet || (focusSet.has(s.id) && focusSet.has(t.id));
          const tier = LINK_TIER_STYLE[linkTier(t.type)];
          // Si el ítem destino está reubicado por el layout de lectura
          // (detalle "full"), el hilo debe entrar por el borde real de su
          // tarjeta, no por el ancla física que la física ya abandonó.
          const targetLayout = itemLayout[t.id];
          const x2 = targetLayout ? targetLayout.anchorX : t.x;
          const y2 = targetLayout ? targetLayout.anchorY : t.y;
          return (
            <g key={i} style={{ opacity: inFocus ? 1 : 0.12, transition: "opacity 220ms ease" }}>
              {/* Gradiente propio de este link (alineado a sus propios x1/y1/x2/y2,
                  no a la caja del SVG) — spreadMethod="repeat" lo hace un patrón
                  infinito de "oscuro-brillante-oscuro" a lo largo de la línea, y
                  animateTransform lo desliza exactamente un período completo
                  (el vector propio de la línea), así el loop no se nota la
                  costura. Da el efecto de "algo corriendo por dentro" en vez de
                  un color fijo, sin animar nada desde React/JS. */}
              <linearGradient
                id={linkGradientId(i)} gradientUnits="userSpaceOnUse"
                x1={s.x} y1={s.y} x2={x2} y2={y2} spreadMethod="repeat"
              >
                <stop offset="0%" stopColor={tier.coreColor} />
                <stop offset="50%" stopColor="#F4FBFF" />
                <stop offset="100%" stopColor={tier.coreColor} />
                <animateTransform
                  attributeName="gradientTransform" type="translate"
                  from="0 0" to={`${x2 - s.x} ${y2 - s.y}`}
                  dur={tier.flowDur} repeatCount="indefinite"
                />
              </linearGradient>
              <line
                x1={s.x} y1={s.y} x2={x2} y2={y2}
                stroke={tier.glowColor} strokeWidth={tier.glow} strokeLinecap="round"
                opacity={0.35} filter={tier.useFilter ? "url(#trunk-glow)" : undefined}
              />
              {tier.midColor && (
                <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={tier.midColor} strokeWidth={tier.core * 1.6} strokeLinecap="round" opacity={0.45} />
              )}
              <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={`url(#${linkGradientId(i)})`} strokeWidth={tier.core} strokeLinecap="round" opacity={0.95} />
            </g>
          );
        })}
      </g>
      <g>
        {gemNodes.map((n) => {
          const inFocus = !focusSet || focusSet.has(n.id);
          const isTouched = focusedNodeIds.has(n.id);
          const isHovered = n.id === hoveredNodeId;
          const isSun = n.type === "sun";
          const sunStyle = isSun ? sunLoadStyle(n.meta && n.meta.weekCount) : null;
          // La geometría se calcula siempre al radio base; crecer al tocar
          // o al pasar el mouse ya no recalcula puntos (eso saltaba de golpe
          // entre un tamaño y otro) — es un transform:scale() con transición
          // CSS sobre el grupo entero, así el crecimiento se ve como un
          // gesto fluido en vez de un salto estático.
          const verts = isSun ? null : shapeVertices(n.type, n.x, n.y, n.radius);
          const points = verts ? shapePointsStr(verts) : null;
          const scale = isTouched ? FOCUS_GROWTH : isHovered ? 1.1 : 1;
          return (
            <g
              key={n.id}
              ref={(el) => {
                // Se reasigna en cada tick — barato, porque la simulación
                // se duerme sola (alpha decay) y d3 reemplaza el mismo
                // listener con nombre en vez de acumularlo.
                if (el && dragBehaviorRef.current) d3.select(el).datum(n).call(dragBehaviorRef.current);
              }}
              className={isSun ? sunStyle.pulseClass || undefined : undefined}
              style={{
                cursor: "grab",
                opacity: inFocus ? 1 : 0.18,
                transform: `scale(${scale})`,
                transformBox: "fill-box",
                transformOrigin: "center",
                transition: "opacity 220ms ease, transform 320ms cubic-bezier(.34,1.56,.64,1)",
                filter: isSun ? sunGlowFilter(sunStyle.color) : GEM_GLOW_FILTER[n.type],
              }}
              onClick={() => handleNodeClick(n)}
              onDoubleClick={() => handleNodeDoubleClick(n)}
              onMouseEnter={() => setHoveredNodeId(n.id)}
              onMouseLeave={() => setHoveredNodeId((h) => (h === n.id ? null : h))}
            >
              {isSun ? (
                // El sol vuelve a ser un óvalo (como era antes de las demás
                // figuras) — es el único nodo con esta silueta, para que
                // siga leyéndose como "el origen" a simple vista.
                <ellipse
                  cx={n.x} cy={n.y} rx={n.radius * 1.25} ry={n.radius * 0.82}
                  fill={`url(#${gemGradientId(n.id)})`} stroke="rgba(190,225,255,0.55)" strokeWidth={1.4}
                />
              ) : (
                <>
                  <polygon points={points} fill={`url(#${gemGradientId(n.id)})`} stroke="rgba(190,225,255,0.55)" strokeWidth={1.2} strokeLinejoin="round" />
                  {verts.map((v, vi) => (
                    <line key={vi} x1={n.x} y1={n.y} x2={v[0]} y2={v[1]} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                  ))}
                </>
              )}
              <ellipse
                cx={n.x - n.radius * 0.32} cy={n.y - n.radius * 0.38}
                rx={n.radius * 0.26} ry={n.radius * 0.14}
                fill="#FFFFFF" opacity={0.22}
              />
            </g>
          );
        })}
      </g>
      <g pointerEvents="none">
        {gemNodes.map((n) => {
          const style = LABEL_STYLE_BY_TYPE[n.type] || LABEL_STYLE_BY_TYPE.category;
          const inFocus = !focusSet || focusSet.has(n.id);
          const effectiveRadius = focusedNodeIds.has(n.id) ? n.radius * FOCUS_GROWTH : n.radius;
          return (
            <text
              key={n.id}
              x={n.x}
              y={n.y + effectiveRadius + 6 + style.fontSize}
              textAnchor="middle"
              fontSize={style.fontSize}
              fontWeight={style.fontWeight}
              fill="#EDEAE1"
              stroke="#0b0f14"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ opacity: inFocus ? 1 : 0.18, transition: "opacity 220ms ease, y 220ms ease" }}
            >
              {truncateLabel(n.label, style.maxChars)}
            </text>
          );
        })}
      </g>
      <g>
        {simNodes.filter((n) => n.type === "item" && n.x != null).map((n) => {
          const inFocus = !focusSet || focusSet.has(n.id);
          const glow = itemGlowStyle(n.meta);
          const detail = itemDetailLevel(n, focusedNodeIds, focusSet, tf.k);

          // Vista general: un punto pequeño con el color de su categoría —
          // barato de pintar (sin foreignObject ni blur) y legible sin
          // amontonarse. Sigue siendo arrastrable y clicable igual que la
          // tarjeta completa.
          if (detail === "compact") {
            const dotRadius = 5;
            return (
              <circle
                key={n.id}
                ref={(el) => { if (el && dragBehaviorRef.current) d3.select(el).datum(n).call(dragBehaviorRef.current); }}
                className={`item-dot-compact ${glow ? glow.pulseClass || "" : ""}`}
                cx={n.x} cy={n.y} r={dotRadius}
                fill={n.color}
                stroke={glow ? glow.stroke : "rgba(220,235,250,0.6)"}
                strokeWidth={glow ? Math.min(glow.strokeWidth, 2) : 1}
                style={{
                  cursor: "grab",
                  opacity: inFocus ? 1 : 0.18,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transition: "opacity 220ms ease, transform 180ms ease",
                  filter: glow && glow.filter ? glow.filter : undefined,
                }}
                onClick={() => handleNodeClick(n)}
              />
            );
          }

          // Rama enfocada o zoom manual: tarjeta completa con el texto
          // entero (glassmorphism), pedida explícitamente para "entrar" a
          // un nodo y leer sus actividades sin que se corte el label. La
          // posición viene del layout explícito por padre (itemLayout),
          // no de la física — así nunca queda una tarjeta sobre otra.
          const layout = itemLayout[n.id];
          const cardW = layout ? layout.w : ITEM_CARD_WIDTH;
          const cardH = layout ? layout.h : estimateItemCardHeight(n.label);
          const cx = layout ? layout.cx : n.x;
          const cy = layout ? layout.cy : n.y;
          const borderColor = glow ? glow.stroke : mixHex(n.color, "#BFE3FF", 0.5);
          const borderWidth = glow ? glow.strokeWidth : 1;
          const glowFilter = glow && glow.filter ? glow.filter : "drop-shadow(0 0 4px rgba(74,158,255,0.25))";
          return (
            <foreignObject
              key={n.id}
              x={cx - cardW / 2} y={cy - cardH / 2}
              width={cardW} height={cardH}
              style={{ opacity: inFocus ? 1 : 0.15, transition: "opacity 220ms ease" }}
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                ref={(el) => { if (el && dragBehaviorRef.current) d3.select(el).datum(n).call(dragBehaviorRef.current); }}
                className={glow ? glow.pulseClass || undefined : undefined}
                onClick={() => handleNodeClick(n)}
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  height: "100%",
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(11,20,30,0.55)",
                  border: `${borderWidth}px solid ${borderColor}`,
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  filter: glowFilter,
                  color: "#EAF2FF",
                  fontFamily: "'Work Sans', sans-serif",
                  fontSize: 9.5,
                  lineHeight: "13px",
                  fontWeight: 500,
                  cursor: "grab",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {n.label}
              </div>
            </foreignObject>
          );
        })}
      </g>
      </g>
    </svg>
    <div className="tree-zoom-controls">
      <button type="button" onClick={() => zoomBy(1.3)} title="Acercar">+</button>
      <button type="button" onClick={() => zoomBy(1 / 1.3)} title="Alejar">−</button>
    </div>
    </div>
  );
}
