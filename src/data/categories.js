// cesde y diseño intercambiaron colores a pedido del usuario (cesde tenía el
// naranja, diseño el magenta); personales pasó de rosado a gris neutro.
// proyectos y bmw se dejaron igual porque ya eran verde/azul, como se pidió.
// "Sin categorizar" va primero: es la categoría por defecto para un
// pendiente que aún no se ha clasificado.
export const CATEGORIES = [
  { id: "sin_categorizar", label: "Sin categorizar", color: "#6C7A89", emoji: "❔" },
  { id: "cesde", label: "CESDE", color: "#D65DB1", emoji: "🎓" },
  { id: "proyectos", label: "Proyectos Propios", color: "#4FA6A0", emoji: "🚀" },
  { id: "aprendizaje", label: "Aprendizaje", color: "#8C6FC9", emoji: "🧠" },
  { id: "personales", label: "Personales Presenciales", color: "#9CA3A8", emoji: "🏡" },
  { id: "bmw", label: "BMW", color: "#5B7FBF", emoji: "🚘" },
  { id: "diseno", label: "Diseño", color: "#E8A33D", emoji: "🎨" },
];

// Cómo se relaciona cada categoría con un "proyecto" (o su variante —
// "Área" en CESDE). Si una categoría no aparece aquí, no tiene ese campo
// en el formulario. sourceCategory dice de qué categoría sale la lista de
// opciones: normalmente la misma, salvo Diseño, que usa los proyectos de
// "Proyectos Propios" porque un diseño suele ser parte de un proyecto propio.
export const PROJECT_FIELD_BY_CATEGORY = {
  cesde: { label: "Área", required: false, sourceCategory: "cesde" },
  proyectos: { label: "Proyecto", required: true, sourceCategory: "proyectos" },
  diseno: { label: "Proyecto", required: true, sourceCategory: "proyectos" },
};

// Áreas por defecto de CESDE — se siembran una sola vez, la primera vez
// que el usuario carga la app y todavía no tiene ninguna guardada.
export const DEFAULT_CESDE_AREAS = ["Backend", "Frontend", "New Tech", "Platzi", "CESDE"];

// Versión más clara (mezclada hacia blanco) del color de una categoría —
// el nodo de la categoría usa el color base (el más intenso), y cada capa
// hacia adentro (proyecto, luego item) se aclara un poco más, para que se
// note el anidamiento sin necesitar un color aparte por capa.
export function lightenHex(hex, amount) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((num & 0xff) + (255 - (num & 0xff)) * amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
}
