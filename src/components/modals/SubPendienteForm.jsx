import { useState } from "react";
import { RichTextField } from "../RichTextField.jsx";

// Formulario inline para crear O editar un subpendiente — solo nombre y
// nota (su descripción): el resto de los campos de un pendiente (categoría,
// proyecto, tipificado, fecha límite...) no aplican acá, un subpendiente
// los hereda del padre. En modo crear vive dentro de ItemDetailPopover (se
// abre con el botón "+" junto a la "✕"); en modo editar (pasando `initial`)
// vive dentro de una tarjeta de SubPendientesWeb, al hacer doble clic.
export function SubPendienteForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [notes, setNotes] = useState(initial ? initial.notes || "" : "");
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Escribe un nombre para el subpendiente."); return; }
    onSubmit({ name: name.trim(), notes: notes.trim() || null });
  }

  return (
    <form className="subpendiente-form" onSubmit={handleSubmit}>
      <input
        className="form-control form-control-sm"
        type="text"
        value={name}
        autoFocus
        placeholder="Nombre del subpendiente"
        onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
      />
      <RichTextField
        className="rich-text-field rich-text-field-sm"
        value={notes}
        onChange={setNotes}
        placeholder="Detalles del subpendiente"
        minHeight="56px"
      />
      {error && <p className="field-error">{error}</p>}
      <div className="subpendiente-form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-ghost">{initial ? "Guardar cambios" : "Añadir subpendiente"}</button>
      </div>
    </form>
  );
}
