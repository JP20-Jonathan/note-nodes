// ===========================================================
// Generador de datos de prueba (50 registros).
// ===========================================================
import { uid, pad2, addDaysToDateStr, addMonthKey } from "./dateUtils.js";
import { projectSourceCategory } from "./businessRules.js";

function dateInMonthDay(monthKeyStr, day) {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(day, 1), lastDay);
  return `${monthKeyStr}-${pad2(d)}`;
}

// Diseño no tiene su propia lista de proyectos: usa la de Proyectos Propios
// (ver PROJECT_FIELD_BY_CATEGORY en categories.js), por eso sus nombres
// también van bajo "proyectos" aquí.
const SEED_PROJECT_NAMES = {
  proyectos: ["Bolis Inventario", "Badget Notes", "React Learning", "Rediseño UX-UI web-bolis", "Katálogo BMW"],
};

// Plan de asignación: categoría (y proyecto si aplica), tipificado y nombre.
// Los conteos respetan los topes (ninguno se acerca a 20/20/5/8).
function buildSeedPlan() {
  return [
    // CESDE (9) — una "este_mes" queda marcada como atrasada para mostrar el aviso
    { category: "cesde", tip: "esta_semana", name: "Entregar taller de bases de datos" },
    { category: "cesde", tip: "esta_semana", name: "Estudiar para el parcial de POO" },
    { category: "cesde", tip: "siguientes_actividades", name: "Subir informe de laboratorio" },
    { category: "cesde", tip: "este_mes", name: "Revisar rúbrica del proyecto final" },
    { category: "cesde", tip: "este_mes", name: "Preparar exposición de Spring Boot", overdueMonth: true },
    { category: "cesde", tip: "proximo_mes", name: "Inscribir electiva del próximo semestre" },
    { category: "cesde", tip: "sin_tipificar", name: "Actualizar bitácora de prácticas" },
    { category: "cesde", tip: "sin_tipificar", name: "Repasar SQL para el quiz" },
    { category: "cesde", tip: "importantisimas", name: "Enviar consentimiento de pasantía" },

    // Aprendizaje (8)
    { category: "aprendizaje", tip: "esta_semana", name: "Ejercicios de recursividad" },
    { category: "aprendizaje", tip: "siguientes_actividades", name: "Practicar consultas SQL avanzadas" },
    { category: "aprendizaje", tip: "este_mes", name: "Repasar patrones de diseño" },
    { category: "aprendizaje", tip: "este_mes", name: "Ejercicio de árboles binarios" },
    { category: "aprendizaje", tip: "proximo_mes", name: "Practicar Git y ramas" },
    { category: "aprendizaje", tip: "sin_tipificar", name: "Tutorial de Docker" },
    { category: "aprendizaje", tip: "sin_tipificar", name: "Ejercicios de lógica de programación" },
    { category: "aprendizaje", tip: "sin_tipificar", name: "Repasar estructuras de datos" },

    // Personales (7) — una "esta_semana" queda atrasada de la semana pasada
    { category: "personales", tip: "esta_semana", name: "Renovar la cédula", overdueWeek: true },
    { category: "personales", tip: "proxima_semana", name: "Sacar cita con el dentista" },
    { category: "personales", tip: "este_mes", name: "Comprar regalo de cumpleaños" },
    { category: "personales", tip: "este_mes", name: "Llevar el carro al taller" },
    { category: "personales", tip: "sin_tipificar", name: "Pagar factura de internet" },
    { category: "personales", tip: "sin_tipificar", name: "Organizar el clóset" },
    { category: "personales", tip: "urgentes", name: "Revisar el seguro del carro" },

    // BMW Work (7)
    { category: "bmw", tip: "esta_semana", name: "Actualizar catálogo de modelos MX" },
    { category: "bmw", tip: "siguientes_actividades", name: "Revisar Zap de Facebook Leads" },
    { category: "bmw", tip: "este_mes", name: "Ajustar formulario RFO" },
    { category: "bmw", tip: "este_mes", name: "Reunión con el equipo de marketing" },
    { category: "bmw", tip: "proximo_mes", name: "Actualizar plantilla de Excel" },
    { category: "bmw", tip: "sin_tipificar", name: "Documentar proceso de Zapier" },
    { category: "bmw", tip: "sin_tipificar", name: "Enviar reporte semanal" },

    // Proyectos Propios (10, repartidos en 3 proyectos)
    { category: "proyectos", project: "Bolis Inventario", tip: "esta_semana", name: "Conectar API de inventario" },
    { category: "proyectos", project: "Bolis Inventario", tip: "este_mes", name: "Diseñar tabla de productos" },
    { category: "proyectos", project: "Bolis Inventario", tip: "este_mes", name: "Probar alertas de stock bajo" },
    { category: "proyectos", project: "Bolis Inventario", tip: "sin_tipificar", name: "Documentar endpoints" },
    { category: "proyectos", project: "Badget Notes", tip: "este_mes", name: "Agregar gráfico de gastos" },
    { category: "proyectos", project: "Badget Notes", tip: "este_mes", name: "Corregir bug de IndexedDB" },
    { category: "proyectos", project: "Badget Notes", tip: "sin_tipificar", name: "Mejorar exportar a PDF" },
    { category: "proyectos", project: "React Learning", tip: "siguientes_actividades", name: "Migrar componente de login" },
    { category: "proyectos", project: "React Learning", tip: "este_mes", name: "Agregar manejo de errores" },
    { category: "proyectos", project: "React Learning", tip: "sin_tipificar", name: "Practicar Context API" },

    // Diseño (9, repartidos en 2 proyectos)
    { category: "diseno", project: "Rediseño UX-UI web-bolis", tip: "esta_semana", name: "Bocetos de la nueva landing" },
    { category: "diseno", project: "Rediseño UX-UI web-bolis", tip: "este_mes", name: "Elegir paleta de colores" },
    { category: "diseno", project: "Rediseño UX-UI web-bolis", tip: "este_mes", name: "Prototipo en Figma" },
    { category: "diseno", project: "Rediseño UX-UI web-bolis", tip: "sin_tipificar", name: "Revisar accesibilidad de contraste" },
    { category: "diseno", project: "Katálogo BMW", tip: "siguientes_actividades", name: "Ilustración modelos 2026" },
    { category: "diseno", project: "Katálogo BMW", tip: "este_mes", name: "Diagramar catálogo MX" },
    { category: "diseno", project: "Katálogo BMW", tip: "este_mes", name: "Ajustar tipografía de marca" },
    { category: "diseno", project: "Katálogo BMW", tip: "proximo_mes", name: "Exportar assets para impresión" },
    { category: "diseno", project: "Katálogo BMW", tip: "sin_tipificar", name: "Revisar pruebas de impresión" },
  ];
}

export function buildTestData(ctx) {
  const { currentMonthKey, nextMonthKey, currentWeekStart, nextWeekStart } = ctx;
  const prevMonthKey = addMonthKey(currentMonthKey, -1);
  const prevWeekStart = addDaysToDateStr(currentWeekStart, -7);

  const seedProjects = {};
  const projectIdByName = {};
  Object.entries(SEED_PROJECT_NAMES).forEach(([categoryId, names]) => {
    seedProjects[categoryId] = names.map((name) => {
      const id = uid();
      projectIdByName[`${categoryId}::${name}`] = id;
      return { id, name, seed: true };
    });
  });

  const orderCounters = {};
  let deadlineCounter = 0;

  const items = buildSeedPlan().map((entry) => {
    let anchorMonth = null, anchorWeek = null, deadline = null;

    if (entry.tip === "este_mes") {
      anchorMonth = entry.overdueMonth ? prevMonthKey : currentMonthKey;
      deadline = entry.overdueMonth ? dateInMonthDay(prevMonthKey, 27) : dateInMonthDay(currentMonthKey, 8 + ((deadlineCounter++ * 5) % 20));
    } else if (entry.tip === "proximo_mes") {
      anchorMonth = nextMonthKey;
    } else if (entry.tip === "esta_semana") {
      anchorWeek = entry.overdueWeek ? prevWeekStart : currentWeekStart;
      deadline = entry.overdueWeek ? addDaysToDateStr(prevWeekStart, 4) : addDaysToDateStr(currentWeekStart, (deadlineCounter++ % 6));
    } else if (entry.tip === "siguientes_actividades") {
      anchorWeek = currentWeekStart;
      deadline = addDaysToDateStr(currentWeekStart, 2 + (deadlineCounter++ % 4));
    } else if (entry.tip === "proxima_semana") {
      anchorWeek = nextWeekStart;
      deadline = addDaysToDateStr(nextWeekStart, (deadlineCounter++ % 6));
    }

    const projectId = entry.project ? projectIdByName[`${projectSourceCategory(entry.category)}::${entry.project}`] : null;
    const orderKey = entry.tip;
    orderCounters[orderKey] = (orderCounters[orderKey] || 0) + 1;

    return {
      id: uid(),
      name: entry.name,
      category: entry.category,
      projectId,
      tipificado: entry.tip,
      anchorMonth, anchorWeek,
      deadline,
      order: orderCounters[orderKey],
      done: false,
      createdAt: Date.now(),
      seed: true,
    };
  });

  const notes = [
    { id: uid(), text: "Llamar al proveedor de vasos biodegradables", x: 40, y: 40, seed: true },
    { id: uid(), text: "Preguntar por curso de Excel avanzado", x: 200, y: 90, seed: true },
  ];

  return { items, seedProjects, notes };
}
