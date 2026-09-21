import { useState } from "react";

const TEST_DELETE_QUERY = "DELETE FROM pendientes WHERE es_prueba = true;";

export function DeleteTestDataModal({ onConfirm, onCancel }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    if (input.trim() !== TEST_DELETE_QUERY) {
      setError("El texto no coincide exactamente con el query de arriba. Revisa mayúsculas, espacios y el punto y coma final.");
      return;
    }
    onConfirm();
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="pnd-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="pnd-serif" style={{ margin: 0, fontSize: 16, color: "var(--sema-red)" }}>
          ¿Seguro que quieres eliminar todos los datos de prueba?
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
          Esto borra los pendientes, proyectos y notas de prueba (no toca nada que hayas agregado tú). No se puede
          deshacer. Para confirmar, escribe exactamente este query abajo — así de paso ves cómo se vería:
        </p>
        <code style={{
          display: "block", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "10px 12px", fontSize: 12.5, color: "var(--sema-yellow)", wordBreak: "break-all",
        }}>{TEST_DELETE_QUERY}</code>
        <input
          className="form-control form-control-sm" type="text" autoFocus value={input}
          onChange={(e) => { setInput(e.target.value); if (error) setError(null); }}
          placeholder="Escribe el query aquí"
        />
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary" style={{ background: "var(--sema-red)", borderColor: "var(--sema-red)", color: "#fff" }}>
            Eliminar definitivamente
          </button>
        </div>
      </form>
    </div>
  );
}
