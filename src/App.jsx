import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
import * as db from "./lib/db.js";
import { AuthScreen } from "./components/auth/AuthScreen.jsx";
import { monthKey, addMonthKey, mondayOf, addDaysToDateStr, todayInMedellin } from "./data/dateUtils.js";
import { anchorFor, countActiveForCap } from "./data/businessRules.js";
import { getTipificado } from "./data/tipificados.js";
import { DEFAULT_CESDE_AREAS } from "./data/categories.js";
import { buildTestData } from "./data/seedData.js";
import { useArbolViewModel } from "./hooks/useArbolViewModel.js";
import { useDragGhost } from "./hooks/useDragGhost.js";
import { ForceGraph } from "./components/tree/ForceGraph.jsx";
import { FloatingNote, CollapsedNoteChip } from "./components/tree/FloatingNote.jsx";
import { ItemDetailPopover } from "./components/modals/ItemDetailPopover.jsx";
import { ItemFormModal } from "./components/modals/ItemFormModal.jsx";
import { DeleteTestDataModal } from "./components/modals/DeleteTestDataModal.jsx";
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
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("tree");
  const [tableroView, setTableroView] = useState("tipificacion");
  const [completeDragOver, setCompleteDragOver] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [showDeleteTestModal, setShowDeleteTestModal] = useState(false);
  const [formState, setFormState] = useState(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const treeAreaRef = useRef(null);

  const { year, month, day } = useMemo(() => todayInMedellin(), []);
  const currentMonthKey = useMemo(() => monthKey(year, month), [year, month]);
  const nextMonthKey = useMemo(() => addMonthKey(currentMonthKey, 1), [currentMonthKey]);
  const currentWeekStart = useMemo(() => mondayOf(year, month, day), [year, month, day]);
  const nextWeekStart = useMemo(() => addDaysToDateStr(currentWeekStart, 7), [currentWeekStart]);
  const arbolViewModel = useArbolViewModel(items, projects, currentMonthKey, currentWeekStart);
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
    try { await db.deleteItem(id); setSaveError(false); } catch (e) { setSaveError(true); }
  }, []);

  const toggleDone = useCallback(async (id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const done = !item.done;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    try { await db.updateItem(id, { done }); setSaveError(false); } catch (e) { setSaveError(true); }
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

  // ---- Notas flotantes tipo Post-it — doble clic sobre el lienzo vacío
  // las crea ahí mismo. Se detecta a mano (dos "click" seguidos, cerca en
  // tiempo y en espacio) en vez de usar el evento "dblclick" del navegador,
  // porque el "dblclick" nativo no llega de forma confiable aquí: d3.zoom
  // tiene sus propios listeners de mousedown/mouseup en el mismo <svg> para
  // el paneo, y esa combinación puede comerse el evento nativo. Un "click"
  // corriente sí llega siempre, así que comparar dos clics entre sí es más
  // confiable que depender de que el navegador arme el doble clic por su cuenta.
  const lastCanvasClickRef = useRef({ time: 0, x: 0, y: 0 });
  async function handleCanvasClick(e) {
    const tag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
    if (tag === "circle" || tag === "text" || e.target.closest(".floating-note, button, input, textarea, select")) return;
    // Las notas se posicionan relativas a treeAreaRef (todo el tab, no solo
    // el lienzo) — ver el comentario junto a su render más abajo.
    const rect = treeAreaRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const now = Date.now();
    const last = lastCanvasClickRef.current;
    const isDouble = now - last.time < 450 && Math.hypot(rawX - last.x, rawY - last.y) < 28;
    lastCanvasClickRef.current = { time: isDouble ? 0 : now, x: rawX, y: rawY };
    if (!isDouble) return;

    const x = Math.round(Math.max(0, rawX - 66));
    const y = Math.round(Math.max(0, rawY - 29));
    try {
      const row = await db.insertNote(userId, { text: "", x, y });
      setNotes((prev) => [...prev, row]);
      setEditingNoteId(row.id);
      setSaveError(false);
    } catch (e) { setSaveError(true); }
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

  const createProject = useCallback(async (categoryId, name) => {
    const row = await db.insertProject(userId, categoryId, name);
    setProjects((prev) => ({ ...prev, [categoryId]: [...(prev[categoryId] || []), row] }));
    return row.id;
  }, [userId]);

  const hasSeedData = items.some((i) => i.seed) || notes.some((n) => n.seed) || Object.values(projects).some((list) => list.some((p) => p.seed));

  async function insertTestData() {
    // Un solo clic accidental aquí reemplaza los 50 datos de prueba — igual
    // de irreversible en la práctica que "Eliminar", así que también pide
    // confirmación (más liviana que ese modal porque esto no toca nada que
    // el usuario haya creado a mano, solo lo re-siembra).
    const confirmMsg = hasSeedData
      ? "Esto reemplaza los datos de prueba actuales por un set nuevo de 50. No toca lo que hayas agregado tú. ¿Continuar?"
      : "Esto agrega 50 pendientes/proyectos/notas de prueba. ¿Continuar?";
    if (!window.confirm(confirmMsg)) return;
    const seed = buildTestData({ currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart });
    try {
      if (hasSeedData) await db.deleteSeedData(userId);
      await db.bulkInsertTestData(userId, seed);
      const fresh = await db.fetchAllData(userId);
      setItems(fresh.items);
      setProjects(fresh.projects);
      setNotes(fresh.notes);
      setSaveError(false);
    } catch (e) { setSaveError(true); }
  }

  async function deleteTestData() {
    try {
      await db.deleteSeedData(userId);
      setItems((prev) => prev.filter((i) => !i.seed));
      setProjects((prev) => {
        const next = {};
        Object.entries(prev).forEach(([catId, list]) => { next[catId] = list.filter((p) => !p.seed); });
        return next;
      });
      setNotes((prev) => prev.filter((n) => !n.seed));
      setSaveError(false);
    } catch (e) { setSaveError(true); }
    setShowDeleteTestModal(false);
  }

  function handleExport() {
    const payload = JSON.stringify({ items, projects, notes }, null, 2);
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
        <button className="btn btn-ghost" onClick={insertTestData}>🧪 {hasSeedData ? "Regenerar" : "Insertar"} 50 datos de prueba</button>
        {hasSeedData && (
          <button className="btn btn-ghost" onClick={() => setShowDeleteTestModal(true)} style={{ color: "var(--sema-red)", borderColor: "var(--sema-red)" }}>
            🗑 Eliminar datos de prueba
          </button>
        )}
      </div>

      {showDeleteTestModal && (
        <DeleteTestDataModal onConfirm={deleteTestData} onCancel={() => setShowDeleteTestModal(false)} />
      )}

      <main className="pnd-main">
        {tab === "tree" && (
          <div className={`tree-tab-area ${treeExpanded ? "tree-expanded" : ""}`} ref={treeAreaRef}>
            <div className="cosmos-stage tree-canvas" ref={canvasRef} onClick={handleCanvasClick}>
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
                onNodeClick={(node) => {
                  if (node.type !== "item") return;
                  const item = items.find((i) => i.id === node.itemId);
                  if (item) setDetailItem(item);
                }}
                onNodeDoubleClick={(node) => {
                  if (node.type === "category") {
                    setFormState({ mode: "create", defaultCategory: node.categoryId, defaultProject: null });
                  } else if (node.type === "project") {
                    setFormState({ mode: "create", defaultCategory: node.categoryId, defaultProject: node.projectId });
                  }
                }}
              />
            </div>

            {/* Las notas expandidas viven por fuera del lienzo (aunque su x/y
                se siga midiendo desde este mismo wrapper) para que se puedan
                arrastrar libremente por toda esta área, sin quedar recortadas
                por el overflow:hidden del lienzo. */}
            {notes.filter((n) => !n.collapsed).map((note) => (
              <FloatingNote key={note.id} note={note} editing={editingNoteId === note.id}
                onStartEdit={startEditNote} onCommit={(text) => commitNoteText(note.id, text)} onDelete={deleteNote}
                onMove={moveNote} onToggleCollapse={toggleNoteCollapsed} onColorChange={changeNoteColor} />
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
              <button className={`pnd-tab ${tableroView === "tipificacion" ? "active" : ""}`} onClick={() => setTableroView("tipificacion")}>Por Tipificación</button>
              <button className={`pnd-tab ${tableroView === "categoria" ? "active" : ""}`} onClick={() => setTableroView("categoria")}>Backlog</button>
            </nav>
            {tableroView === "tipificacion" ? (
              <TableroView
                items={items} projects={projects} currentMonthKey={currentMonthKey} currentWeekStart={currentWeekStart}
                onDropItem={handleTableroDrop} onRenew={renewItem}
                onEditOverdue={(item) => setFormState({ mode: "edit", item })}
                onOpenDetail={setDetailItem} dragGhost={dragGhost}
              />
            ) : (
              <CategoriaBoardView
                items={items} projects={projects} todayStr={`${currentMonthKey}-01`} onSchedule={reassignItem}
                onCreate={(categoryId) => setFormState({ mode: "create", defaultCategory: categoryId, defaultProject: null })}
                onOpenDetail={setDetailItem} dragGhost={dragGhost}
              />
            )}
          </div>
        )}
      </main>

      {detailItem && (
        <ItemDetailPopover
          item={detailItem} projects={projects} currentMonthKey={currentMonthKey} currentWeekStart={currentWeekStart}
          onClose={() => setDetailItem(null)}
          onToggleDone={(id) => { toggleDone(id); setDetailItem(null); }}
          onEdit={(item) => { setDetailItem(null); setFormState({ mode: "edit", item }); }}
          onDelete={(id) => { deleteItemById(id); setDetailItem(null); }}
          onRenew={(id) => { renewItem(id); setDetailItem(null); }}
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
    </div>
  );
}
