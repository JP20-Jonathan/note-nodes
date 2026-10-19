import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
import * as db from "./lib/db.js";
import { AuthScreen } from "./components/auth/AuthScreen.jsx";
import { monthKey, addMonthKey, mondayOf, addDaysToDateStr, todayInMedellin, pad2 } from "./data/dateUtils.js";
import { anchorFor, countActiveForCap, findProjectIdInText } from "./data/businessRules.js";
import { getTipificado } from "./data/tipificados.js";
import { DEFAULT_CESDE_AREAS, CATEGORIES, PROJECT_FIELD_BY_CATEGORY } from "./data/categories.js";
import { loadColorOverrides, saveColorOverrides } from "./data/colorOverrides.js";
import { useArbolViewModel } from "./hooks/useArbolViewModel.js";
import { useDragGhost } from "./hooks/useDragGhost.js";
import { ForceGraph } from "./components/tree/ForceGraph.jsx";
import { IndicatorsPanel } from "./components/tree/IndicatorsPanel.jsx";
import { ColorLegend } from "./components/tree/ColorLegend.jsx";
import { ContextMenu } from "./components/ContextMenu.jsx";
import { ClipboardComposer } from "./components/tree/ClipboardComposer.jsx";
import { draftNodeKey, listDrafts } from "./data/itemDrafts.js";
import { FloatingNote, CollapsedNoteChip } from "./components/tree/FloatingNote.jsx";
import { ItemDetailPopover } from "./components/modals/ItemDetailPopover.jsx";
import { ItemFormModal } from "./components/modals/ItemFormModal.jsx";
import { CompletedItemsModal } from "./components/modals/CompletedItemsModal.jsx";
import { ColorControllerModal } from "./components/modals/ColorControllerModal.jsx";
import { TableroView } from "./components/tablero/TableroView.jsx";
import { CategoriaBoardView } from "./components/tablero/CategoriaBoardView.jsx";

export function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="pnd-app"><div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Cargando…</div></div>;
  }
  if (!session) return <AuthScreen />;
  return <PendientesApp key={session.user.id} userId={session.user.id} userEmail={session.user.email} />;
}

function PendientesApp({ userId, userEmail }) {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState({});
  const [notes, setNotes] = useState([]);
  // Subpendientes agrupados por id de pendiente padre (mismo patrón que
  // `projects`, agrupado por categoría) para que ItemDetailPopover los
  // busque en O(1) en vez de filtrar un array plano en cada render.
  const [subPendientes, setSubPendientes] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("tree");
  const [tableroView, setTableroView] = useState("tipificacion");
  const [completeDragOver, setCompleteDragOver] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  // De dónde se abrió el popover de detalle — "grafo" exige un segundo clic
  // para marcar hecho (ver ItemDetailPopover), el Tablero no.
  const [detailSource, setDetailSource] = useState(null);
  const openDetailFromTablero = useCallback((item) => { setDetailItem(item); setDetailSource("tablero"); }, []);
  // Filtro de tipificado del panel de indicadores — a propósito NO se
  // persiste (ver IndicatorsPanel.jsx): es una exploración puntual de la
  // sesión, no algo que tenga sentido recordar entre recargas.
  const [tipificadoFilter, setTipificadoFilter] = useState(() => new Set());
  const toggleTipificadoFilter = useCallback((tipId) => {
    setTipificadoFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tipId)) next.delete(tipId);
      else next.add(tipId);
      return next;
    });
  }, []);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showColorController, setShowColorController] = useState(false);
  const [colorOverrides, setColorOverrides] = useState(() => loadColorOverrides());
  const handleColorOverrideChange = useCallback((key, hex) => {
    setColorOverrides((prev) => {
      const next = { ...prev, [key]: hex };
      saveColorOverrides(next);
      return next;
    });
  }, []);
  const handleColorOverrideReset = useCallback((key) => {
    setColorOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      saveColorOverrides(next);
      return next;
    });
  }, []);
  const [formState, setFormState] = useState(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const treeAreaRef = useRef(null);
  // Posición inicial de IndicatorsPanel/ColorLegend: se miden en vivo contra
  // el lienzo del Árbol (esquina superior izquierda / inferior derecha, "como
  // están" hoy) para que arranquen ahí mismo aunque ahora vivan por fuera del
  // lienzo (necesario para poder arrastrarlos también al fondo sin usar). Si
  // el usuario ya los arrastró antes, cada componente ignora este default
  // (ver useDraggablePosition + localStorage dentro de cada uno).
  const [indicatorsDefaultPos, setIndicatorsDefaultPos] = useState(null);
  const [legendDefaultPos, setLegendDefaultPos] = useState(null);
  // Tamaño del lienzo EN MODO NORMAL (relativo a treeAreaRef, mismo sistema
  // de coordenadas que las posiciones de ambos paneles) — se lo pasamos
  // para que cada uno sepa si lo arrastraron "al fondo sin usar" (fuera del
  // lienzo). A propósito solo se actualiza fuera de pantalla completa: el
  // lienzo expandido mide mucho más alto, y si tomáramos esa medida como
  // referencia, una posición que estaba afuera en modo normal pasaría a
  // leerse como "adentro" del lienzo gigante — justo el punto en el que el
  // panel aparece encimado en medio de la vista en vez de quedar oculto.
  const [canvasBounds, setCanvasBounds] = useState(null);
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const areaEl = treeAreaRef.current;
    if (!canvasEl || !areaEl || typeof ResizeObserver === "undefined") return;
    function recompute() {
      const canvasRect = canvasEl.getBoundingClientRect();
      const areaRect = areaEl.getBoundingClientRect();
      setIndicatorsDefaultPos({ x: canvasRect.left - areaRect.left + 10, y: canvasRect.top - areaRect.top + 10 });
      setLegendDefaultPos({ x: canvasRect.right - areaRect.left - 230, y: canvasRect.bottom - areaRect.top - 120 });
      if (!treeExpanded) setCanvasBounds({ width: canvasRect.width, height: canvasRect.height });
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(canvasEl);
    return () => ro.disconnect();
  }, [tab, loaded, treeExpanded]);

  const { year, month, day } = useMemo(() => todayInMedellin(), []);
  const currentMonthKey = useMemo(() => monthKey(year, month), [year, month]);
  const nextMonthKey = useMemo(() => addMonthKey(currentMonthKey, 1), [currentMonthKey]);
  const currentWeekStart = useMemo(() => mondayOf(year, month, day), [year, month, day]);
  const nextWeekStart = useMemo(() => addDaysToDateStr(currentWeekStart, 7), [currentWeekStart]);
  // Fecha real de HOY (no "el 1 del mes actual", que es lo que varios
  // componentes usaban a modo de aproximación — bug real: "vence"/"venció"
  // y el color de urgencia de los chips de deadline solo funcionaban bien
  // los primeros días del mes). Se calcula una sola vez acá y se pasa hacia
  // abajo a todo lo que compare contra "hoy".
  const todayStr = useMemo(() => `${year}-${pad2(month)}-${pad2(day)}`, [year, month, day]);
  const arbolViewModel = useArbolViewModel(items, projects, currentMonthKey, currentWeekStart, nextWeekStart, colorOverrides, subPendientes);
  const dragGhost = useDragGhost();

  // Fondo de partículas (constelación) — se inicializa una sola vez, fuera
  // del ciclo de React; tsParticles maneja su propio loop de animación.
  useEffect(() => {
    if (!window.tsParticles) return;
    window.tsParticles.load({
      id: "tsparticles",
      options: {
        fpsLimit: 60,
        detectRetina: true,
        background: { color: { value: "transparent" } },
        particles: {
          number: { value: 50, density: { enable: true, area: 900 } },
          color: { value: ["#E8A33D", "#4FA6A0", "#8C6FC9", "#EDEAE1"] },
          opacity: { value: { min: 0.15, max: 0.45 } },
          size: { value: { min: 1, max: 2.2 } },
          move: { enable: true, speed: 0.3, direction: "none", random: true, outModes: { default: "out" } },
          links: { enable: true, distance: 120, color: "#EDEAE1", opacity: 0.12, width: 1 },
        },
        interactivity: {
          events: { onHover: { enable: true, mode: "grab" }, resize: true },
          modes: { grab: { distance: 140, links: { opacity: 0.35 } } },
        },
      },
    }).catch(() => { /* si el fondo no carga, la app sigue funcionando igual */ });
  }, []);

  // Escape cierra la vista de pantalla completa del Árbol.
  useEffect(() => {
    if (!treeExpanded) return;
    function onKeyDown(e) { if (e.key === "Escape") setTreeExpanded(false); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [treeExpanded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await db.fetchAllData(userId);
        if (cancelled) return;
        // Áreas de CESDE por defecto: se siembran una sola vez, la primera
        // vez que este usuario no tiene ninguna guardada todavía.
        if (!data.projects.cesde || data.projects.cesde.length === 0) {
          const seeded = [];
          for (const name of DEFAULT_CESDE_AREAS) {
            seeded.push(await db.insertProject(userId, "cesde", name));
          }
          data.projects = { ...data.projects, cesde: seeded };
        }
        setItems(data.items);
        setProjects(data.projects);
        setNotes(data.notes);
        setSubPendientes(data.subPendientes);
        setLoaded(true);
      } catch (e) {
        if (!cancelled) { setLoadError(true); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const addItem = useCallback(async (data) => {
    const monthActive = items.filter((i) => i.tipificado === data.tipificado && !i.done);
    const maxOrder = monthActive.reduce((m, i) => Math.max(m, i.order || 0), -1);
    try {
      const row = await db.insertItem(userId, { ...data, order: maxOrder + 1 });
      setItems((prev) => [...prev, row]);
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, [items, userId]);

  const patchItem = useCallback(async (id, patch) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    try { await db.updateItem(id, patch); setSaveError(false); } catch (e) { setSaveError(true); }
  }, []);

  const deleteItemById = useCallback(async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    // Sus subpendientes se borran en cascada en la base (FK on delete
    // cascade) — acá solo se limpia el estado local para que no queden
    // huérfanos a la vista hasta la próxima recarga.
    setSubPendientes((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try { await db.deleteItem(id); setSaveError(false); } catch (e) { setSaveError(true); }
  }, []);

  const addSubPendiente = useCallback(async (pendienteId, data) => {
    try {
      const row = await db.insertSubPendiente(userId, pendienteId, data);
      setSubPendientes((prev) => ({ ...prev, [pendienteId]: [...(prev[pendienteId] || []), row] }));
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, [userId]);

  const deleteSubPendiente = useCallback(async (id, pendienteId) => {
    setSubPendientes((prev) => (
      prev[pendienteId] ? { ...prev, [pendienteId]: prev[pendienteId].filter((s) => s.id !== id) } : prev
    ));
    try { await db.deleteSubPendiente(id); setSaveError(false); } catch (e) { setSaveError(true); }
  }, []);

  const editSubPendiente = useCallback(async (id, pendienteId, data) => {
    setSubPendientes((prev) => (
      prev[pendienteId]
        ? { ...prev, [pendienteId]: prev[pendienteId].map((s) => (s.id === id ? { ...s, ...data } : s)) }
        : prev
    ));
    try { await db.updateSubPendiente(id, data); setSaveError(false); } catch (e) { setSaveError(true); }
  }, []);

  const toggleDone = useCallback(async (id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const done = !item.done;
    const doneAt = done ? Date.now() : null;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done, doneAt } : i)));
    try {
      await db.updateItem(id, { done, doneAt: done ? new Date(doneAt).toISOString() : null });
      setSaveError(false);
    } catch (e) {
      // Si todavía no corriste la migración de done_at en Supabase, la
      // columna no existe y este update falla — reintenta sin ella para que
      // marcar hecho/pendiente nunca se rompa por eso (solo se pierde la
      // fecha de completado hasta que corras la migración).
      try { await db.updateItem(id, { done }); setSaveError(false); } catch (e2) { setSaveError(true); }
    }
  }, [items]);

  // Reordenar por arrastre: mueve draggedId a la posición de targetId dentro
  // de su mismo grupo (mismo tipificado, sin fecha límite, no completados) y
  // resecuencia el order de todo el grupo del 0 en adelante.
  const reorderItem = useCallback((draggedId, targetId) => {
    if (draggedId === targetId) return;
    setItems((prev) => {
      const dragged = prev.find((i) => i.id === draggedId);
      const target = prev.find((i) => i.id === targetId);
      if (!dragged || !target || dragged.tipificado !== target.tipificado) return prev;

      const siblings = prev
        .filter((i) => i.tipificado === dragged.tipificado && !i.done && !i.deadline)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const fromIdx = siblings.findIndex((i) => i.id === draggedId);
      const toIdx = siblings.findIndex((i) => i.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const reordered = siblings.filter((i) => i.id !== draggedId);
      reordered.splice(toIdx, 0, dragged);

      const orderById = {};
      reordered.forEach((i, idx) => { orderById[i.id] = idx; });
      const changed = [];
      const next = prev.map((i) => {
        if (orderById[i.id] == null || i.order === orderById[i.id]) return i;
        changed.push({ id: i.id, order: orderById[i.id] });
        return { ...i, order: orderById[i.id] };
      });
      if (changed.length > 0) db.updateItemsOrder(changed).then(() => setSaveError(false)).catch(() => setSaveError(true));
      return next;
    });
  }, []);

  // Reasignar por arrastre a una columna de otro tipificado (Tablero). El
  // ancla se recalcula igual que en ItemFormModal (misma tabla, anchorFor).
  // La fecha límite nunca se toca aquí: es un dato independiente del
  // tipificado, así que se conserva tal cual la tenía el pendiente.
  const reassignItem = useCallback(async (id, newTipificado) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.tipificado === newTipificado) return;
    const tipDef = getTipificado(newTipificado);
    const anchors = anchorFor(newTipificado, { currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart });
    if (tipDef.cap != null) {
      const count = countActiveForCap(items, {
        category: item.category, projectId: item.projectId, tipificado: newTipificado,
        ...anchors, excludeId: item.id,
      });
      if (count >= tipDef.cap) {
        window.alert(`Ya tienes ${tipDef.cap} pendientes de "${tipDef.label}" en ${item.projectId ? "este proyecto" : "esta categoría"}.`);
        return;
      }
    }
    await patchItem(id, {
      tipificado: newTipificado,
      anchorMonth: anchors.anchorMonth,
      anchorWeek: anchors.anchorWeek,
    });
  }, [items, currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart, patchItem]);

  // Punto único de entrada para cualquier soltar dentro del Tablero: si el
  // pendiente arrastrado ya era de ese tipificado, es un reorden manual
  // (mismo grupo); si es de otro, es una reasignación.
  const handleTableroDrop = useCallback((draggedId, targetId, tipificadoId) => {
    const dragged = items.find((i) => i.id === draggedId);
    if (!dragged) return;
    if (dragged.tipificado === tipificadoId) {
      if (targetId) reorderItem(draggedId, targetId);
    } else {
      reassignItem(draggedId, tipificadoId);
    }
  }, [items, reorderItem, reassignItem]);

  // Renovar: mantiene el mismo tipificado pero actualiza su ancla al
  // período que le corresponde ahora (este_mes/esta_semana -> el actual,
  // proximo_mes/proxima_semana -> el siguiente a partir de hoy). Es la
  // opción rápida cuando no quieres reasignar a otro tipificado, solo
  // "renovar el plazo" del que ya tenía.
  const renewItem = useCallback(async (id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const anchors = anchorFor(item.tipificado, { currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart });
    if (anchors.anchorMonth == null && anchors.anchorWeek == null) return;
    await patchItem(id, anchors);
  }, [items, currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart, patchItem]);

  // ---- Notas flotantes tipo Post-it — clic derecho sobre el lienzo vacío
  // abre un menú con "+ Nueva nota aquí" (ver ContextMenu.jsx). Antes era
  // doble-clic, detectado "a mano" porque el dblclick nativo choca con los
  // listeners de arrastre/zoom de d3 — un parche frágil que ya se rompió
  // una vez (ver historial de App.jsx). El clic derecho es un evento propio
  // que d3 no toca, y ya es el lenguaje que usa el resto de la app (clic
  // derecho en una nota = menú de color).
  const [canvasMenu, setCanvasMenu] = useState(null);
  const [nodeDraftsMenu, setNodeDraftsMenu] = useState(null);
  function handleCanvasContextMenu(e) {
    // Misma exclusión por forma concreta de nodo que ya se necesitaba antes
    // (ver FloatingNote.jsx/ForceGraph.jsx): no abrir este menú si el clic
    // derecho fue sobre un nodo del árbol, una nota (que tiene su propio
    // menú de color) o cualquier control de la UI encima del lienzo.
    const NODE_SHAPE_TAGS = new Set(["circle", "polygon", "text", "line", "ellipse", "foreignobject", "div"]);
    const tag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
    if (NODE_SHAPE_TAGS.has(tag) || e.target.closest(".floating-note, button, input, textarea, select, .indicators-panel, .color-legend")) return;
    e.preventDefault();
    // Las notas se posicionan relativas a treeAreaRef (todo el tab, no solo
    // el lienzo) — ver el comentario junto a su render más abajo.
    const rect = treeAreaRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    // -190 = mitad del ancho de .floating-note (380px), para que la nota
    // nazca centrada en el punto donde se hizo clic derecho, no con su
    // esquina ahí.
    setCanvasMenu({ screenX: e.clientX, screenY: e.clientY, noteX: Math.round(Math.max(0, rawX - 190)), noteY: Math.round(Math.max(0, rawY - 29)) });
  }
  async function createNoteAt(x, y) {
    try {
      const row = await db.insertNote(userId, { text: "", x, y });
      setNotes((prev) => [...prev, row]);
      setEditingNoteId(row.id);
      setSaveError(false);
    } catch (e) { setSaveError(true); }
  }
  // Desde ClipboardComposer: la "Nota rápida" crea un pendiente directo (no
  // una nota flotante) — el primer renglón que el usuario escribió es el
  // nombre, el resto (con su negrilla/lista tal cual) es la nota opcional;
  // categoría/tipificado/fecha límite los elige ahí mismo, en el composer.
  // El composer no pregunta por proyecto/área, así que si la categoría lo
  // necesita lo buscamos mencionado dentro del cuerpo de la nota.
  async function createItemFromComposer({ name, notes, category, tipificado, deadline }) {
    const anchors = anchorFor(tipificado, { currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart });
    const projectField = PROJECT_FIELD_BY_CATEGORY[category];
    const categoryProjects = projectField ? (projects[projectField.sourceCategory] || []) : [];
    const projectId = findProjectIdInText(notes, categoryProjects);
    await addItem({
      name, category, projectId, tipificado,
      anchorMonth: anchors.anchorMonth, anchorWeek: anchors.anchorWeek,
      deadline: deadline || null, notes,
    });
  }
  async function commitNoteText(id, text) {
    const trimmed = text.trim();
    setEditingNoteId(null);
    if (!trimmed) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      try { await db.deleteNote(id); setSaveError(false); } catch (e) { setSaveError(true); }
    } else {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text: trimmed } : n)));
      try { await db.updateNoteText(id, trimmed); setSaveError(false); } catch (e) { setSaveError(true); }
    }
  }
  async function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try { await db.deleteNote(id); setSaveError(false); } catch (e) { setSaveError(true); }
  }
  function startEditNote(id) { setEditingNoteId(id); }

  // Arrastrar una nota reposiciona su ancla libremente por el lienzo — así
  // el usuario puede sacarlas de en medio del árbol en vez de que floten
  // fijas estorbando la vista, sobre todo en pantalla completa.
  async function moveNote(id, x, y) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    try { await db.updateNotePosition(id, x, y); setSaveError(false); } catch (e) { setSaveError(true); }
  }
  // Doble clic colapsa/expande (acordeón): una nota que estorba se encoge a
  // una burbuja chica sin perder su texto ni su posición.
  async function toggleNoteCollapsed(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const collapsed = !note.collapsed;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, collapsed } : n)));
    try { await db.updateNoteCollapsed(id, collapsed); setSaveError(false); } catch (e) { setSaveError(true); }
  }
  async function changeNoteColor(id, color) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
    try { await db.updateNoteColor(id, color); setSaveError(false); } catch (e) { setSaveError(true); }
  }
  async function changeNoteSize(id, width, height) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, width, height } : n)));
    try { await db.updateNoteSize(id, width, height); setSaveError(false); } catch (e) { setSaveError(true); }
  }

  const createProject = useCallback(async (categoryId, name) => {
    const row = await db.insertProject(userId, categoryId, name);
    setProjects((prev) => ({ ...prev, [categoryId]: [...(prev[categoryId] || []), row] }));
    return row.id;
  }, [userId]);

  function handleExport() {
    const payload = JSON.stringify({ items, projects, notes, subPendientes }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mis-pendientes-${currentMonthKey}-${day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function handleImportClick() { fileInputRef.current && fileInputRef.current.click(); }
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      // Separado en dos try/catch a propósito: un JSON mal formado y un
      // fallo de red/base de datos son errores muy distintos — antes se
      // mostraba el mismo mensaje genérico para ambos, lo que hacía parecer
      // "roto" el botón cuando en realidad, por ejemplo, la base de datos
      // no tenía corrida la migración de nombres de tabla.
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        window.alert("Ese archivo no es un JSON válido — no parece un respaldo de Note Nodes.");
        return;
      }
      if (!window.confirm("Esto reemplaza tus pendientes actuales por los del archivo de respaldo. ¿Continuar?")) return;
      try {
        await db.replaceAllData(userId, parsed);
        const fresh = await db.fetchAllData(userId);
        setItems(fresh.items);
        setProjects(fresh.projects);
        setNotes(fresh.notes);
        setSubPendientes(fresh.subPendientes);
        setSaveError(false);
      } catch (err) {
        console.error("Error restaurando el respaldo:", err);
        window.alert(`No se pudo restaurar el respaldo: ${err.message || "revisa tu conexión."}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  if (!loaded) {
    return <div className="pnd-app"><div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Cargando tus pendientes…</div></div>;
  }

  return (
    <div className="pnd-app">
      <header className="pnd-header">
        <h1>Note Nodes</h1>
        <p className="pnd-sub">
          {saveError ? "No se pudo guardar el último cambio — revisa tu conexión."
            : loadError ? "No se pudieron cargar tus pendientes — revisa tu conexión."
            : "Un árbol para todo lo que tienes por hacer"}
        </p>
        <p className="pnd-sub" style={{ marginTop: 6 }}>
          {userEmail} · <button className="btn-ghost" style={{ display: "inline-flex", padding: "3px 9px" }} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </p>
      </header>

      <nav className="pnd-tabs">
        <button className={`pnd-tab ${tab === "tree" ? "active" : ""}`} onClick={() => setTab("tree")}>🌳 Árbol</button>
        <button className={`pnd-tab ${tab === "tablero" ? "active" : ""}`} onClick={() => setTab("tablero")}>🗂️ Tablero</button>
      </nav>

      <div className="backup-bar">
        <button className="btn btn-ghost" onClick={handleExport}>⬇ Descargar respaldo</button>
        <button className="btn btn-ghost" onClick={handleImportClick}>⬆ Restaurar respaldo</button>
        <input type="file" accept="application/json" ref={fileInputRef} style={{ display: "none" }} onChange={handleImportFile} />
        <button className="btn btn-ghost" onClick={() => setShowCompletedModal(true)}>📜 Completados</button>
        <button className="btn btn-ghost" onClick={() => setShowColorController(true)}>🎨 Colores</button>
      </div>

      {showCompletedModal && (
        <CompletedItemsModal items={items} projects={projects} onRevert={toggleDone} onClose={() => setShowCompletedModal(false)} />
      )}

      {showColorController && (
        <ColorControllerModal
          categories={CATEGORIES}
          projects={projects}
          overrides={colorOverrides}
          onChange={handleColorOverrideChange}
          onReset={handleColorOverrideReset}
          onClose={() => setShowColorController(false)}
        />
      )}

      <main className="pnd-main">
        {tab === "tree" && (
          <div className={`tree-tab-area ${treeExpanded ? "tree-expanded" : ""}`} ref={treeAreaRef}>
            <div className="cosmos-stage tree-canvas" ref={canvasRef} onContextMenu={handleCanvasContextMenu}>
              <button
                type="button"
                className="icon-btn tree-expand-btn"
                title={treeExpanded ? "Salir de pantalla completa" : "Ver en pantalla completa"}
                onClick={() => setTreeExpanded((v) => !v)}
              >
                {treeExpanded ? "✕" : "⛶"}
              </button>
              <ForceGraph
                nodes={arbolViewModel.nodes} links={arbolViewModel.links} byId={arbolViewModel.byId}
                tipificadoFilter={tipificadoFilter}
                onNodeClick={(node) => {
                  // Un subpendiente no tiene detalle propio — abre el mismo
                  // popover de su pendiente padre (node.itemId apunta al
                  // padre en ambos tipos, ver useArbolViewModel.js).
                  if (node.type !== "item" && node.type !== "subpendiente") return;
                  const item = items.find((i) => i.id === node.itemId);
                  if (item) { setDetailItem(item); setDetailSource("grafo"); }
                }}
                onNodeDoubleClick={(node) => {
                  if (node.type === "category") {
                    setFormState({ mode: "create", defaultCategory: node.categoryId, defaultProject: null });
                  } else if (node.type === "project") {
                    setFormState({ mode: "create", defaultCategory: node.categoryId, defaultProject: node.projectId });
                  }
                }}
                onNodeContextMenu={(node, x, y) => {
                  const drafts = listDrafts(draftNodeKey(node.categoryId, node.projectId));
                  if (drafts.length === 0) return;
                  setNodeDraftsMenu({ screenX: x, screenY: y, categoryId: node.categoryId, projectId: node.projectId, drafts });
                }}
              />
            </div>

            {/* Indicadores, leyenda de colores y notas expandidas viven por
                fuera del lienzo (aunque su posición se siga midiendo desde
                este mismo wrapper) para que se puedan arrastrar libremente
                por toda esta área — incluso fuera del grafo, sobre el fondo
                sin usar — sin quedar recortadas por el overflow:hidden del
                lienzo. */}
            <IndicatorsPanel
              items={items} projects={projects} notes={notes}
              tipificadoFilter={tipificadoFilter} onToggleFilter={toggleTipificadoFilter}
              defaultPos={indicatorsDefaultPos} canvasBounds={canvasBounds} hideWhenOutside={treeExpanded}
            />
            <ColorLegend
              items={items} currentMonthKey={currentMonthKey} currentWeekStart={currentWeekStart}
              defaultPos={legendDefaultPos} canvasBounds={canvasBounds} hideWhenOutside={treeExpanded}
            />
            {notes.filter((n) => !n.collapsed).map((note) => (
              <FloatingNote key={note.id} note={note} editing={editingNoteId === note.id}
                onStartEdit={startEditNote} onCommit={(text) => commitNoteText(note.id, text)} onDelete={deleteNote}
                onMove={moveNote} onToggleCollapse={toggleNoteCollapsed} onColorChange={changeNoteColor} onResize={changeNoteSize} />
            ))}

            {/* Las colapsadas ya no usan su x/y libre — se apilan en un riel
                fijo al lado derecho, cada una con su primera línea de texto
                como título, para no perderlas de vista ni que terminen fuera
                de la pantalla. */}
            {notes.some((n) => n.collapsed) && (
              <div className="notes-rail">
                {notes.filter((n) => n.collapsed).map((note) => (
                  <CollapsedNoteChip key={note.id} note={note}
                    onExpand={toggleNoteCollapsed} onDelete={deleteNote} onColorChange={changeNoteColor} />
                ))}
              </div>
            )}
          </div>
        )}
        {tab === "tablero" && (
          <div>
            {tableroView === "tipificacion" && (
              <div
                className={`tablero-complete-zone ${completeDragOver ? "drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setCompleteDragOver(true); }}
                onDragLeave={() => setCompleteDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setCompleteDragOver(false);
                  const draggedId = e.dataTransfer.getData("text/plain");
                  if (draggedId) toggleDone(draggedId);
                  dragGhost.end();
                }}
                title="Arrastra un pendiente aquí para marcarlo como completado"
              >
                ✓ Completar
              </div>
            )}
            <nav className="pnd-tabs" style={{ marginTop: 0, marginBottom: 20 }}>
              <button className={`pnd-tab ${tableroView === "tipificacion" ? "active" : ""}`} onClick={() => setTableroView("tipificacion")}>Por Temporalidad</button>
              <button className={`pnd-tab ${tableroView === "categoria" ? "active" : ""}`} onClick={() => setTableroView("categoria")}>Backlog</button>
            </nav>
            {tableroView === "tipificacion" ? (
              <TableroView
                items={items} projects={projects} currentMonthKey={currentMonthKey} currentWeekStart={currentWeekStart} todayStr={todayStr}
                onDropItem={handleTableroDrop} onRenew={renewItem}
                onEditOverdue={(item) => setFormState({ mode: "edit", item })}
                onOpenDetail={openDetailFromTablero} dragGhost={dragGhost}
              />
            ) : (
              <CategoriaBoardView
                items={items} projects={projects} todayStr={todayStr} onSchedule={reassignItem}
                onCreate={(categoryId) => setFormState({ mode: "create", defaultCategory: categoryId, defaultProject: null })}
                onOpenDetail={openDetailFromTablero} dragGhost={dragGhost}
              />
            )}
          </div>
        )}
      </main>

      {detailItem && (
        <ItemDetailPopover
          key={detailItem.id}
          item={detailItem} projects={projects} subPendientes={subPendientes[detailItem.id]} currentMonthKey={currentMonthKey} currentWeekStart={currentWeekStart} todayStr={todayStr}
          confirmDone={detailSource === "grafo"}
          onClose={() => { setDetailItem(null); setDetailSource(null); }}
          onToggleDone={(id) => { toggleDone(id); setDetailItem(null); setDetailSource(null); }}
          onEdit={(item) => { setDetailItem(null); setDetailSource(null); setFormState({ mode: "edit", item }); }}
          onDelete={(id) => { deleteItemById(id); setDetailItem(null); setDetailSource(null); }}
          onRenew={(id) => { renewItem(id); setDetailItem(null); setDetailSource(null); }}
          onAddSubPendiente={addSubPendiente}
          onDeleteSubPendiente={deleteSubPendiente}
          onEditSubPendiente={editSubPendiente}
        />
      )}

      {formState && (
        <ItemFormModal
          formState={formState}
          currentMonthKey={currentMonthKey} nextMonthKey={nextMonthKey}
          currentWeekStart={currentWeekStart} nextWeekStart={nextWeekStart}
          items={items} projects={projects} onEnsureProject={createProject}
          onCancel={() => setFormState(null)}
          onSubmit={async (data) => {
            if (formState.mode === "edit") await patchItem(formState.item.id, data);
            else await addItem(data);
            setFormState(null);
          }}
        />
      )}

      {dragGhost.preview && (
        <div className="drag-ghost" style={{ left: dragGhost.preview.x, top: dragGhost.preview.y }}>{dragGhost.preview.label}</div>
      )}

      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.screenX} y={canvasMenu.screenY}
          items={[{ label: "+ Nueva nota aquí", onClick: () => createNoteAt(canvasMenu.noteX, canvasMenu.noteY) }]}
          onClose={() => setCanvasMenu(null)}
        />
      )}

      {nodeDraftsMenu && (
        <ContextMenu
          x={nodeDraftsMenu.screenX} y={nodeDraftsMenu.screenY}
          items={nodeDraftsMenu.drafts
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((draft) => ({
              label: `📝 ${draft.name || "(sin título)"}`,
              onClick: () => setFormState({ mode: "create", defaultCategory: nodeDraftsMenu.categoryId, defaultProject: nodeDraftsMenu.projectId, resumeDraft: draft }),
            }))}
          onClose={() => setNodeDraftsMenu(null)}
        />
      )}

      <ClipboardComposer onConvert={createItemFromComposer} />
    </div>
  );
}
