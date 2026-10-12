import { lightenHex } from "../../data/categories.js";
import { categoryColorKey, projectColorKey } from "../../data/colorOverrides.js";

const LIGHTEN_STEP = 0.35;

// Deja elegir un color a mano por categoría y por proyecto/área (ver
// useArbolViewModel.js, que lee este mismo override) — hace falta porque el
// color automático (aclarar el de la categoría por capa) a veces deja dos
// proyectos de la misma categoría indistinguibles entre sí, o directamente
// grisáceos si la categoría ya era un gris neutro (ej. Personales).
function ColorRow({ label, keyName, color, isOverridden, onChange, onReset, indent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: indent ? 20 : 0 }}>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(keyName, e.target.value)}
        style={{ width: 28, height: 28, padding: 0, border: "none", borderRadius: 6, background: "none", cursor: "pointer" }}
      />
      <span style={{ fontSize: 13.5, flex: 1 }}>{label}</span>
      {isOverridden && (
        <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => onReset(keyName)}>
          ↺ Original
        </button>
      )}
    </div>
  );
}

export function ColorControllerModal({ categories, projects, overrides, onChange, onReset, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pnd-modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <h3 className="pnd-serif" style={{ margin: 0, fontSize: 16 }}>Colores de categorías y proyectos</h3>
          <button className="btn icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "4px 0 2px" }}>
          El color de un proyecto/área se hereda a sus pendientes en el Árbol; si cambiás el de una categoría, sus proyectos sin color propio lo siguen.
        </p>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {categories.map((cat) => {
            const catKey = categoryColorKey(cat.id);
            const catColor = overrides[catKey] || cat.color;
            const catProjects = projects[cat.id] || [];
            return (
              <div key={cat.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ColorRow
                  label={`${cat.emoji} ${cat.label}`}
                  keyName={catKey}
                  color={catColor}
                  isOverridden={!!overrides[catKey]}
                  onChange={onChange}
                  onReset={onReset}
                />
                {catProjects.map((project) => {
                  const projKey = projectColorKey(project.id);
                  const projColor = overrides[projKey] || lightenHex(catColor, LIGHTEN_STEP);
                  return (
                    <ColorRow
                      key={project.id}
                      label={project.name}
                      keyName={projKey}
                      color={projColor}
                      isOverridden={!!overrides[projKey]}
                      onChange={onChange}
                      onReset={onReset}
                      indent
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
