// La fecha límite es siempre opcional para cualquier tipificado (se puede
// agregar a mano si se quiere, pero no la exige el formulario).
export const TIPIFICADOS = [
  { id: "esta_semana", label: "Esta semana", scope: "week", cap: 5 },
  { id: "siguientes_actividades", label: "Siguientes actividades", scope: "week", cap: 8 },
  { id: "proxima_semana", label: "Próxima semana", scope: "week", cap: null },
  { id: "este_mes", label: "Este mes", scope: "month", cap: 20 },
  { id: "proximo_mes", label: "Próximo mes", scope: "month", cap: 20 },
  { id: "sin_tipificar", label: "Sin tipificar", scope: null, cap: null },
  { id: "urgentes", label: "Urgentes", scope: null, cap: null },
  { id: "importantisimas", label: "Importantísimas", scope: null, cap: null },
];

export function getTipificado(id) {
  return TIPIFICADOS.find((t) => t.id === id) || TIPIFICADOS.find((t) => t.id === "sin_tipificar");
}

export const TIPIFICADO_ICON = {
  esta_semana: "🌕", siguientes_actividades: "🌖", proxima_semana: "🌗",
  este_mes: "🪐", proximo_mes: "🌌",
  sin_tipificar: "☄️", urgentes: "🔥", importantisimas: "⭐",
};
