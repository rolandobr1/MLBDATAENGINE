# Fase 6 (Frontend) — Puntos 2 y 3: recomendación

Este documento cubre los dos puntos evaluativos de la Fase 6 del plan de mejora
(`PLAN_DE_MEJORA_MLBDATAENGINE.md`) que no requerían tocar código, sino un
análisis y una recomendación. El punto 1 (dividir `GameCard.tsx` y
`BetTracking.tsx` en subcomponentes) ya se implementó por separado.

## Punto 2 — ¿Separar Bet Tracking del proyecto de pipeline?

**Lo que encontré revisando el código:**

Bet Tracking y el pipeline de datos comparten el mismo proyecto de Firebase
(`src/config/firebase.ts`, un único `db`/`app` inicializado ahí) y el mismo
build de React/Vite/Express que corre en Render. Pero al mirar las
colecciones de Firestore que realmente toca cada lado, la superposición es
menor de lo que sugiere "comparten colecciones":

- El pipeline (`firestoreService.ts`) lee y escribe la colección `games` y
  sus subcolecciones (`weather`, `line_movements`, `betting_history`,
  `offensive_splits`, `fatigue_metrics`, `model_features`, `game_result`,
  `snapshots`).
- Bet Tracking (`betService.ts`) usa dos colecciones propias y sin relación
  con las anteriores: `mlb_bets` (una apuesta por fecha) y `mlb_users/registered`
  (lista de usuarios). No lee ni escribe nada de `games`.

Es decir: el acoplamiento real no está en los datos (las colecciones no se
tocan entre sí) sino en la infraestructura — comparten credenciales de
Firebase, el mismo `package.json`/build, y el mismo deploy en Render. En la
UI tampoco están separados: `BetTracking` se muestra como una sección
plegable dentro del mismo dashboard (`App.tsx`), no como una página o app
aparte.

**Recomendación:** no separarlo en un repositorio/proyecto distinto por
ahora. El beneficio de aislar el código sería principalmente estético (dos
`git log` más limpios), pero el costo es real: duplicar la configuración de
Firebase y su autenticación anónima (justo el tema que quedó pendiente en la
Fase 5 de seguridad), duplicar el pipeline de build/deploy, y romper la
experiencia actual de "todo en un mismo dashboard" que hoy tiene el usuario.
La división en subcomponentes ya hecha en el punto 1 (`betTracking/*`)
consigue la mayor parte del beneficio real — un archivo más chico y quirúrgico
para tocar — sin pagar el costo de separar el proyecto.

Si en el futuro Bet Tracking creciera mucho (multiusuario real, más lógica de
negocio, necesidad de un ciclo de deploy independiente del pipeline), vale la
pena revisar esto de nuevo. Por ahora la señal más fuerte para actuar sería
que cambios al pipeline empiecen a romper Bet Tracking por accidente (o
viceversa) — algo que no encontré evidencia de que esté pasando, precisamente
porque las colecciones de Firestore no se cruzan.

## Punto 3 — Rendimiento de render con muchas tarjetas de juego

**Lo que encontré revisando el código:**

`App.tsx` renderiza una `GameCard` por cada juego del día
(`filteredGames.map(...)`, línea ~886) y ninguna está envuelta en
`React.memo`. Más importante: hay un polling automático cada 60 segundos
mientras haya al menos un juego "en vivo" (`useEffect` en `App.tsx`, línea
~300) que llama a `fetchLocalDB` y reemplaza el array completo de `games`
con `setGames(data.games || [])` — es decir, un array nuevo con objetos
nuevos para *todos* los juegos del día, no solo el que cambió.

Como ninguna `GameCard` está memoizada, ese reemplazo completo del array hace
que React vuelva a renderizar y recalcular las estadísticas derivadas
(`getPitcherDisplayStats`, `getBattersTotals`, `getPitchersTotals`, etc.) de
**todas** las tarjetas visibles cada 60 segundos, aunque 9 de 10 juegos no
hayan cambiado un solo dato. Con los ~15 juegos que puede haber en un día
cargado de MLB, hoy esto probablemente no se nota, pero es exactamente el
patrón que se vuelve lento si el número de tarjetas simultáneas crece (por
ejemplo, si en el futuro se muestra más de un día a la vez).

La división de la Fase 6 punto 1 ayuda pero no resuelve esto: ahora cada
pestaña de `GameCard` es su propio componente, así que en teoría se podrían
memoizar por separado — pero ese trabajo de memoización todavía no está
hecho.

**Recomendación (para cuando el dataset de un día crezca y esto empiece a
notarse — no es urgente hoy):**

1. Envolver `GameCard` en `React.memo`, con una comparación custom (o
   memoizando el `game` que le llega) para que una tarjeta no se re-renderice
   si su propio juego no cambió.
2. En `App.tsx`, al recibir `data.games` del polling, fusionar por `id`
   contra el array anterior en vez de reemplazar todo el array — así los
   juegos sin cambios conservan la misma referencia de objeto y `React.memo`
   los descarta sin trabajo extra.
3. Envolver en `useCallback` los props que hoy son funciones inline
   (`onRefresh={() => handleRefreshGame(...)}`, `onTogglePin={() =>
   togglePin(...)}`) — si no, invalidan el memo de todas formas porque son
   una función nueva en cada render del padre.

No lo implementé porque el punto 3 del plan pide explícitamente "revisar" el
rendimiento, no cambiarlo todavía, y porque hoy no hay evidencia de que esté
causando un problema real (el usuario no reportó lentitud) — pero si el
número de juegos por día crece o se agregan más pestañas con cálculos
pesados, este es el primer lugar a mirar.
