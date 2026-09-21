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
    if (!event.active) simulation.alphaTarget(0.3).restart();
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

// El nodo enfocado (clic simple en categoría/proyecto) y toda su rama —
// ancestros hasta el sol, y descendientes hasta los items — quedan "en
// foco"; el resto se atenúa. null = sin foco, todo visible por igual.
function computeFocusSet(nodes, focusedNodeId) {
  if (!focusedNodeId) return null;
  const byNodeId = {};
  nodes.forEach((n) => { byNodeId[n.id] = n; });
  const related = new Set();
  let ancestor = byNodeId[focusedNodeId];
  while (ancestor) { related.add(ancestor.id); ancestor = ancestor.parentId ? byNodeId[ancestor.parentId] : null; }
  nodes.forEach((n) => {
    let p = n;
    while (p) {
      if (p.id === focusedNodeId) { related.add(n.id); break; }
      p = p.parentId ? byNodeId[p.parentId] : null;
    }
  });
  return related;
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
  const [, bumpTick] = useState(0);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [size, setSize] = useState({ width: 880, height: 560 });

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
      .force("charge", d3.forceManyBody().strength(-140))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("link", d3.forceLink(simLinks).id((d) => d.id).distance(50))
      .force("collide", d3.forceCollide().radius((d) => d.radius + 4))
      .on("tick", () => bumpTick((t) => t + 1));

    dragBehaviorRef.current = makeDragBehavior(simulation, dragStateRef);

    return () => simulation.stop();
  }, [nodes, links, width, height]);

  // Paneo y zoom — en un efecto aparte, que solo corre una vez, para que
  // arrastrar/agregar un pendiente (que reconstruye la simulación de arriba)
  // no reinicie la posición de la cámara que el usuario ya movió.
  useEffect(() => {
    const svgSel = d3.select(svgRef.current);
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 3])
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
    svgSel.on("wheel.zoom", (event) => {
      event.preventDefault();
      if (event.ctrlKey) {
        zoomBehavior.scaleBy(svgSel, event.deltaY > 0 ? 0.92 : 1.08, d3.pointer(event));
      } else {
        const k = transformRef.current.k;
        zoomBehavior.translateBy(svgSel, -event.deltaX / k, -event.deltaY / k);
      }
    });

    return () => svgSel.on(".zoom", null);
  }, []);

  function zoomBy(factor) {
    if (zoomBehaviorRef.current) zoomBehaviorRef.current.scaleBy(d3.select(svgRef.current), factor);
  }

  const simNodes = simNodesRef.current;
  const simLinks = simLinksRef.current;
  const tf = transformRef.current;
  // parentId es estable entre ticks (viene tal cual del hook), así que el
  // set de foco se puede calcular sobre "nodes" (los originales) en vez de
  // recalcularlo por cada tick de la simulación.
  const focusSet = useMemo(() => computeFocusSet(nodes, focusedNodeId), [nodes, focusedNodeId]);

  function resolveOriginal(node) {
    return (byId && byId[node.id]) || node;
  }

  // Clic en el sol = quitar el foco ("volver"). Clic en categoría/proyecto =
  // enfocar su rama. Clic en un item = abrir su detalle (via onNodeClick).
  // Si hubo arrastre, el clic que sigue al soltar se ignora (mismo patrón
  // "moved" que ya usa FloatingNote). El objeto que se entrega hacia afuera
  // es siempre el original del hook (vía byId), no el clon con x/y/vx/vy de
  // la simulación — quien escuche onNodeClick no debería ver ruido físico.
  function handleNodeClick(node) {
    if (dragStateRef.current.moved) return;
    const original = resolveOriginal(node);
    if (original.type === "sun") setFocusedNodeId(null);
    else if (original.type === "category" || original.type === "project") setFocusedNodeId(original.id);
    if (typeof onNodeClick === "function") onNodeClick(original);
  }

  // Doble clic en categoría/proyecto: confirma el foco en esa rama y avisa
  // hacia afuera (onNodeDoubleClick) para que quien lo use abra el formulario
  // de "nuevo pendiente" ya preseleccionado ahí.
  function handleNodeDoubleClick(node) {
    if (dragStateRef.current.moved) return;
    const original = resolveOriginal(node);
    if (original.type !== "category" && original.type !== "project") return;
    setFocusedNodeId(original.id);
    if (typeof onNodeDoubleClick === "function") onNodeDoubleClick(original);
  }

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative" }}>
    <svg
      ref={svgRef} width={width} height={height}
      style={{ background: "#0b0f14", borderRadius: 12, maxWidth: "100%", cursor: "grab", touchAction: "none" }}
      onClick={(e) => { if (e.target === svgRef.current) setFocusedNodeId(null); }}
    >
      <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>
      <g stroke="#ffffff44" strokeWidth={1}>
        {simLinks.map((l, i) => {
          const s = l.source, t = l.target;
          if (!s || !t || s.x == null || t.x == null) return null;
          const inFocus = !focusSet || (focusSet.has(s.id) && focusSet.has(t.id));
          return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} style={{ opacity: inFocus ? 1 : 0.12, transition: "opacity 220ms ease" }} />;
        })}
      </g>
      <g>
        {simNodes.map((n) => {
          if (n.x == null) return null;
          const inFocus = !focusSet || focusSet.has(n.id);
          const isTouched = n.id === focusedNodeId;
          const effectiveRadius = isTouched ? n.radius * FOCUS_GROWTH : n.radius;
          const glow = n.type === "item" ? itemGlowStyle(n.meta) : null;
          return (
            <circle
              key={n.id}
              ref={(el) => {
                // Se reasigna en cada tick — barato, porque la simulación
                // se duerme sola (alpha decay) y d3 reemplaza el mismo
                // listener con nombre en vez de acumularlo.
                if (el && dragBehaviorRef.current) d3.select(el).datum(n).call(dragBehaviorRef.current);
              }}
              className={glow ? glow.pulseClass || undefined : undefined}
              cx={n.x}
              cy={n.y}
              r={effectiveRadius}
              fill={n.color}
              stroke={glow ? glow.stroke : "none"}
              strokeWidth={glow ? glow.strokeWidth : 0}
              style={{
                cursor: "grab",
                opacity: inFocus ? 1 : 0.18,
                transition: "opacity 220ms ease, r 220ms ease",
                filter: glow && glow.filter ? glow.filter : undefined,
              }}
              onClick={() => handleNodeClick(n)}
              onDoubleClick={() => handleNodeDoubleClick(n)}
            />
          );
        })}
      </g>
      <g pointerEvents="none">
        {simNodes.map((n) => {
          if (n.x == null) return null;
          const style = LABEL_STYLE_BY_TYPE[n.type] || LABEL_STYLE_BY_TYPE.item;
          const inFocus = !focusSet || focusSet.has(n.id);
          const effectiveRadius = n.id === focusedNodeId ? n.radius * FOCUS_GROWTH : n.radius;
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
      </g>
    </svg>
    <div className="tree-zoom-controls">
      <button type="button" onClick={() => zoomBy(1.3)} title="Acercar">+</button>
      <button type="button" onClick={() => zoomBy(1 / 1.3)} title="Alejar">−</button>
    </div>
    </div>
  );
}
