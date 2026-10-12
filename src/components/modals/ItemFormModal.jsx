import { useEffect, useRef, useState } from "react";
import { CATEGORIES, PROJECT_FIELD_BY_CATEGORY } from "../../data/categories.js";
import { TIPIFICADOS, getTipificado } from "../../data/tipificados.js";
import { anchorFor, countActiveForCap } from "../../data/businessRules.js";
import { draftNodeKey, listDrafts, saveDraft, discardDraft, newDraftId } from "../../data/itemDrafts.js";
import { RichTextField } from "../RichTextField.jsx";

export function ItemFormModal({ formState, currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart, items, projects, onEnsureProject, onCancel, onSubmit }) {
  const editing = formState.mode === "edit";
  const existing = formState.item;
  // Borradores: solo aplica a "crear" (editar un pendiente ya guardado no
  // necesita esto, ya vive en la base de datos). resumeDraft llega desde el
  // menú de clic derecho del nodo (ver ForceGraph.jsx/App.jsx) cuando el
  // usuario elige continuar uno específico; si no, se ofrece el más
  // reciente de este nodo en un banner (ver más abajo), sin forzarlo.
  const resume = !editing ? formState.resumeDraft : null;
  const nodeKey = !editing ? draftNodeKey(formState.defaultCategory, formState.defaultProject) : null;
  const draftIdRef = useRef(resume ? resume.id : null);
  const [existingDraftsAtOpen] = useState(() => (!editing && !resume ? listDrafts(nodeKey) : []));
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const mostRecentDraft = existingDraftsAtOpen.length > 0
    ? existingDraftsAtOpen.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : null;

  const [name, setName] = useState(resume ? resume.name : (existing ? existing.name : ""));
  const [category, setCategory] = useState(resume ? resume.category : (existing ? existing.category : (formState.defaultCategory || CATEGORIES[0].id)));
  // Solo CESDE (como "Área"), Proyectos Propios y Diseño tienen este campo.
  // Diseño no tiene su propia lista: usa la de Proyectos Propios, porque un
  // diseño suele ser parte de un proyecto propio.
  const projectField = PROJECT_FIELD_BY_CATEGORY[category];
  const categoryProjects = projectField ? (projects[projectField.sourceCategory] || []) : [];
  const [projectChoice, setProjectChoice] = useState(() => {
    if (resume) return resume.projectChoice;
    if (existing && existing.projectId) return existing.projectId;
    if (formState.defaultProject) return formState.defaultProject;
    return "__none__";
  });
  const [newProjectName, setNewProjectName] = useState(resume ? resume.newProjectName || "" : "");

  const [tipificado, setTipificado] = useState(resume ? resume.tipificado : (existing ? existing.tipificado : (formState.defaultTipificado || "sin_tipificar")));
  const tipDef = getTipificado(tipificado);
  const [deadline, setDeadline] = useState(resume ? resume.deadline || "" : (existing && existing.deadline ? existing.deadline : ""));
  const [showDeadline, setShowDeadline] = useState(resume ? !!resume.showDeadline : !!(existing && existing.deadline));
  const [notes, setNotes] = useState(resume ? resume.notes || "" : (existing && existing.notes ? existing.notes : ""));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Autoguardado (debounced) del borrador mientras se escribe — solo al
  // crear, y solo si hay al menos un nombre (no vale la pena guardar un
  // borrador totalmente vacío). El id del borrador se genera una sola vez,
  // la primera vez que hay algo que guardar, y se reusa de ahí en adelante
  // para que las siguientes escrituras ACTUALICEN el mismo borrador en vez
  // de crear uno nuevo por cada cambio.
  useEffect(() => {
    if (editing || !name.trim()) return;
    const timer = setTimeout(() => {
      if (!draftIdRef.current) draftIdRef.current = newDraftId();
      saveDraft(nodeKey, {
        id: draftIdRef.current, name, category, projectChoice, newProjectName,
        tipificado, deadline, showDeadline, notes, updatedAt: Date.now(),
      });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, name, category, projectChoice, newProjectName, tipificado, deadline, showDeadline, notes]);

  function resumeFromDraft(draft) {
    setName(draft.name);
    setCategory(draft.category);
    setProjectChoice(draft.projectChoice);
    setNewProjectName(draft.newProjectName || "");
    setTipificado(draft.tipificado);
    setDeadline(draft.deadline || "");
    setShowDeadline(!!draft.showDeadline);
    setNotes(draft.notes || "");
    draftIdRef.current = draft.id;
    setBannerDismissed(true);
  }

  function handleCategoryChange(newCat) {
    setCategory(newCat);
    setProjectChoice("__none__");
    setNewProjectName("");
  }

  const anchorCtx = { currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Escribe un nombre para el pendiente."); return; }

    let projectId = null;
    if (projectField) {
      if (projectChoice === "__new__") {
        if (!newProjectName.trim()) { setError(`Escribe un nombre para el/la nuevo/a ${projectField.label.toLowerCase()}.`); return; }
      } else if (projectChoice !== "__none__") {
        projectId = projectChoice;
      } else if (projectField.required) {
        setError(`Esta categoría necesita un/a ${projectField.label.toLowerCase()}.`);
        return;
      }
    }

    let anchorMonth = existing ? existing.anchorMonth : null;
    let anchorWeek = existing ? existing.anchorWeek : null;
    const tipificadoChanged = !existing || existing.tipificado !== tipificado;
    if (tipificadoChanged) {
      const anchors = anchorFor(tipificado, anchorCtx);
      anchorMonth = anchors.anchorMonth;
      anchorWeek = anchors.anchorWeek;
    }

    if (tipDef.cap != null) {
      const count = countActiveForCap(items, {
        category, projectId, tipificado, anchorMonth, anchorWeek,
        excludeId: existing ? existing.id : null,
      });
      const alreadyHadThisSlot = existing && !tipificadoChanged;
      if (!alreadyHadThisSlot && count >= tipDef.cap) {
        setError(`Ya tienes ${tipDef.cap} pendientes de "${tipDef.label}" en ${projectId ? "este proyecto" : "esta categoría"}. Completa, elimina o mueve alguno antes de agregar otro.`);
        return;
      }
    }

    setBusy(true);
    try {
      if (projectField && projectChoice === "__new__") {
        projectId = await onEnsureProject(projectField.sourceCategory, newProjectName.trim());
      }
      setError(null);
      await onSubmit({
        name: name.trim(), category, projectId, tipificado,
        anchorMonth, anchorWeek, deadline: showDeadline && deadline ? deadline : null,
        notes: notes.trim() || null,
      });
      if (!editing && draftIdRef.current) discardDraft(nodeKey, draftIdRef.current);
    } catch (err) {
      setError(err.message || "No se pudo guardar, intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const resolvedProjectId = projectChoice === "__new__" || projectChoice === "__none__" ? null : projectChoice;
  const capCount = tipDef.cap != null
    ? countActiveForCap(items, { category, projectId: resolvedProjectId, tipificado, ...anchorFor(tipificado, anchorCtx), excludeId: existing ? existing.id : null })
    : null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="pnd-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3 className="pnd-serif" style={{ margin: 0, fontSize: 17 }}>{editing ? "Editar pendiente" : "Nuevo pendiente"}</h3>

        {mostRecentDraft && !bannerDismissed && (
          <div className="draft-banner">
            <span>
              Tenés un borrador sin terminar acá{existingDraftsAtOpen.length > 1 ? ` (${existingDraftsAtOpen.length})` : ""}
              {mostRecentDraft.name ? ` — "${mostRecentDraft.name}"` : ""}.
            </span>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button type="button" className="btn-ghost" onClick={() => resumeFromDraft(mostRecentDraft)}>Continuar</button>
              <button type="button" className="btn-ghost" onClick={() => setBannerDismissed(true)}>Empezar de cero</button>
            </div>
          </div>
        )}

        <div className="field">
          <label>Nombre</label>
          <input className="form-control form-control-sm" type="text" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(null); }} placeholder="¿Qué tienes que hacer?" autoFocus />
        </div>

        <div className="field">
          <label>Categoría</label>
          <select className="form-select form-select-sm" value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        {projectField && (
          <div className="field">
            <label>{projectField.label}{!projectField.required && " (opcional)"}</label>
            <select className="form-select form-select-sm" value={projectChoice} onChange={(e) => setProjectChoice(e.target.value)}>
              {!projectField.required && <option value="__none__">Sin {projectField.label.toLowerCase()} (directo en la categoría)</option>}
              {projectField.required && projectChoice === "__none__" && <option value="__none__" disabled>Elige un/a {projectField.label.toLowerCase()}…</option>}
              {categoryProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new__">+ Nuevo/a {projectField.label.toLowerCase()}…</option>
            </select>
            {projectChoice === "__new__" && (
              <input className="form-control form-control-sm" type="text" placeholder={`Nombre del/de la ${projectField.label.toLowerCase()}`} value={newProjectName}
                onChange={(e) => { setNewProjectName(e.target.value); if (error) setError(null); }} style={{ marginTop: 8 }} />
            )}
          </div>
        )}

        <div className="field">
          <label>Tipificado</label>
          <select className="form-select form-select-sm" value={tipificado} onChange={(e) => { setTipificado(e.target.value); if (error) setError(null); }}>
            {TIPIFICADOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {tipDef.cap != null && <span className="cap-note">{capCount}/{tipDef.cap} usados en esta {resolvedProjectId ? "proyecto" : "categoría"}</span>}
        </div>

        <div className="field">
          <label>Fecha límite (opcional)</label>
          {showDeadline ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="form-control form-control-sm" type="date" value={deadline} autoFocus
                onChange={(e) => { setDeadline(e.target.value); if (error) setError(null); }}
                style={{ flex: 1 }}
              />
              <button type="button" className="icon-btn" title="Quitar fecha" onClick={() => { setDeadline(""); setShowDeadline(false); }}>✕</button>
            </div>
          ) : (
            <button type="button" className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowDeadline(true)}>
              + Agregar fecha límite
            </button>
          )}
        </div>

        <div className="field">
          <label>Notas (opcional)</label>
          <RichTextField
            className="rich-text-field"
            value={notes}
            onChange={setNotes}
            placeholder="Detalles del pendiente"
            minHeight="110px"
          />
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{editing ? "Guardar cambios" : "Agregar"}</button>
        </div>
      </form>
    </div>
  );
}
