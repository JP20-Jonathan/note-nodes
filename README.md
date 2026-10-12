🌌 Mis Pendientes

Un gestor de tareas personal con una vista de árbol/galaxia navegable (nodos con física de D3), pensado para organizar pendientes de distintas áreas de mi vida (estudio, trabajo, proyectos propios) sin que se mezclen entre sí.

No es un proyecto de práctica ni un clon de tutorial: lo uso yo mismo todos los días para organizar mis pendientes reales.

¿Por qué lo construí?

Porque ya usaba dos planners (uno de universidad, otro de proyectos personales), así que no necesitaba "otro planner" necesitaba donde apuntar y categorizar todos mis pendientes, añadiendo la posibilidad de verlos todos a la vez, Permitiendome tomar decisiones claras y definir lo urgente que es cada uno. De ahí salió el sistema de "temporalidad" que antes se llamaba "tipificados" en vez de simplemente asignar mes/semana.

Stack
Frontend: React 18 + Vite
Visualización: D3.js (simulación de fuerzas) para el grafo de nodos del Árbol
Backend: Supabase — PostgreSQL, Auth y Row Level Security
Características principales
Autenticación real con Supabase Auth (correo/contraseña) — cada usuario solo ve sus propios datos.
Árbol navegable tipo galaxia: categorías, proyectos y pendientes representados como nodos con física de D3 (arrastre, zoom, paneo).
10 tipificados (esta semana, este mes, urgentes, obligatorios, etc.) en vez de un simple calendario, cada uno con su propia regla de tope y de si pide fecha límite.
Vencimiento y promoción automática: un pendiente de "próximo mes" pasa solo a "este mes" cuando llega la fecha; uno de "este mes" que no se completa se marca atrasado — todo calculado en tiempo real, anclado a la hora de Medellín.
Topes configurables por categoría o por proyecto (ej. máximo 5 pendientes en "esta semana" por proyecto), para no sobrecargar ninguna área.
Vista Tablero (por tipificado y por categoría) como alternativa a la vista de árbol.
Notas flotantes tipo post-it que se convierten en pendientes reales al arrastrarlas sobre una categoría.
Seguridad de los datos

La base de datos tiene Row Level Security activado en las tres tablas (projects, items, notes). Cada política compara auth.uid() contra el user_id de la fila, así que el control de acceso vive en la base de datos, no en el código — aunque el repo sea público, nadie más puede leer ni modificar los pendientes de otro usuario.

Cómo correrlo en local
bash
# 1. Clonar e instalar dependencias
git clone <url-del-repo>
cd mis-pendientes
npm install

# 2. Crear un proyecto en supabase.com y correr el esquema
# (Supabase Dashboard -> SQL Editor -> pegar y ejecutar supabase/schema.sql)

# 3. Configurar variables de entorno
cp .env.example .env
# completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con los datos de tu proyecto

# 4. Levantar el servidor de desarrollo
npm run dev
Estructura del proyecto
src/
├── components/
│   ├── auth/        # Pantalla de login/registro
│   ├── modals/       # Crear/editar pendiente, detalle, borrar datos de prueba
│   ├── tablero/       # Vista Tablero (por tipificado y por categoría)
│   └── tree/          # Grafo de nodos (Árbol) y notas flotantes
├── data/               # Reglas de negocio: categorías, tipificados, fechas, topes
├── hooks/              # Lógica del árbol como view model
└── lib/                # Cliente de Supabase y capa de acceso a datos
supabase/
└── schema.sql          # Tablas, políticas de RLS e índices
Estado del proyecto

En uso activo — lo sigo ajustando a medida que cambia cómo organizo mis propios pendientes.