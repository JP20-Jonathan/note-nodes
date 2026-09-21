import { useState } from "react";
import { CATEGORIES, PROJECT_FIELD_BY_CATEGORY } from "../../data/categories.js";
import { TIPIFICADOS, getTipificado } from "../../data/tipificados.js";
import { anchorFor, countActiveForCap } from "../../data/businessRules.js";

export function ItemFormModal({ formState, currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart, items, projects, onEnsureProject, onCancel, onSubmit }) {
  const editing = formState.mode === "edit";
  const existing = formState.item;

  const [name, setName] = useState(existing ? existing.name : "");
  const [category, setCategory] = useState(existing ? existing.category : (formState.defaultCategory || CATEGORIES[0].id));
  // Solo CESDE (como "Área"), Proyectos Propios y Diseño tienen este campo.
  // Diseño no tiene su propia lista: usa la de Proyectos Propios, porque un
  // diseño suele ser parte de un proyecto propio.
  const projectField = PROJECT_FIELD_BY_CATEGORY[category];
  const categoryProjects = projectField ? (projects[projectField.sourceCategory] || []) : [];
  const [projectChoice, setProjectChoice] = useState(() => {
    if (existing && existing.projectId) return existing.projectId;
    if (formState.defaultProject) return formState.defaultProject;
    return "__none__";
  });
  const [newProjectName, setNewProjectName] = useState("");

  const [tipificado, setTipificado] = useState(existing ? existing.tipificado : (formState.defaultTipificado || "sin_tipificar"));
  const tipDef = getTipificado(tipificado);
  const [deadline, setDeadline] = useState(existing && existing.deadline ? existing.deadline : "");
  const [showDeadline, setShowDeadline] = useState(!!(existing && existing.deadline));
  const [notes, setNotes] = useState(existing && existing.notes ? existing.notes : "");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
          <textarea
            className="form-control form-control-sm" rows={5} value={notes}
            placeholder="Escribe aquí lo que quieras sobre este pendiente…"
            onChange={(e) => setNotes(e.target.value)}
            style={{ resize: "vertical", fontFamily: "inherit" }}
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
