# Fase 7 — Plan de mejoras de UX/UI (completa)

**Estado: las 4 tandas (A, B, C, D) están implementadas, validadas con
`tsc --noEmit` y entregadas a la máquina real.** Las notas de cada tanda se
dejan como estaban al proponerlas; al final de cada una hay un resumen de
lo que efectivamente se implementó.

Este plan organiza en tandas ejecutables las 14 sugerencias de UX/UI
identificadas al revisar `App.tsx`, `GameCard` (y sus 7 pestañas),
`Header.tsx` y `BetTracking`. Ninguna toca la lógica de datos del pipeline
(ETL, CSV, Firestore) — todo es capa visual/interacción en React.

Orden pensado para minimizar riesgo primero: cada tanda es
independiente entre sí (no hay que hacer la A completa para empezar la B),
así que se puede parar después de cualquiera de ellas y quedar en un estado
consistente.

## Tanda A — Bajo riesgo, cambios chicos y aislados

Ningún cambio de esta tanda toca estado ni estructura de componentes; son
ajustes de markup/estilos dentro de archivos que la Fase 6 ya dejó chicos.

1. **`aria-label` en botones de ícono** — `GameCard.tsx` (ojo, pin, refresh,
   exportar) y `Header.tsx` (info de pitchers faltantes, cerrar diagnósticos).
   Hoy solo tienen `title`, que no ayuda en mobile ni siempre a lectores de
   pantalla.
2. **Cerrar popovers al hacer click afuera** — el menú de "Exportar" en
   `BetTracking.tsx` y el popover de "pitchers faltantes" en `Header.tsx`
   solo se cierran con su propio botón. Un `useEffect` con listener de
   `mousedown` en el documento (patrón estándar, sin librería) lo resuelve
   en ambos lugares.
3. **Separador visual "Fijados"** — en `App.tsx`, antes del primer grupo de
   tarjetas ancladas (cuando `pinnedGames.length > 0`), un pequeño
   encabezado dentro del `columns-1 xl:columns-2` para que no se sientan
   tarjetas "saltando" sin explicación.
4. **Botón "Limpiar filtros"** — junto a la barra de búsqueda/selects en
   `App.tsx`, visible solo cuando `searchQuery` o algún filtro ≠ "All".
5. **Íconos de lucide en vez de emoji** en los 4 `<select>` de filtros
   (Hora/Estatus/Liga/División) — mismo comportamiento, solo consistencia
   visual con el resto de la UI.

**Validación:** `tsc --noEmit` + revisión visual en el navegador (capturas
antes/después de cada punto). Sin riesgo de romper nada del pipeline.

**✅ Implementado.** Los 5 puntos se hicieron tal cual — `aria-label` en los
botones de ícono de `GameCard.tsx`, `Header.tsx` y `DiagnosticsPanel.tsx`;
cierre por click-afuera en el menú de "Exportar" (`BetTracking.tsx`) y el
popover de pitchers faltantes (`Header.tsx`); separador "Fijados" en
`App.tsx`; botón "Limpiar filtros"; e íconos de lucide en los 4 selects de
filtro en vez de emoji.

## Tanda B — Riesgo bajo-medio, tocan interacción o accesibilidad de teclado

6. **Headers colapsables accesibles** — convertir los `<div onClick>` de
   "Panel de Control de Harvester" y "Bet Tracking" en `<button>` (o agregar
   `role="button"`, `tabIndex={0}` y manejo de `Enter`/`Espacio`), para que
   se puedan togglear con teclado y se anuncien correctamente.
7. **CTA directo en el estado vacío** — "No hay registros locales para esta
   fecha" hoy solo dice "haz click arriba"; agregarle un botón que expanda
   el panel de Harvester y haga scroll hacia él (`isHarvesterExpanded` +
   `scrollIntoView`, ambos ya existen en `App.tsx`).
8. **Contraste del banner en Brewers y Pirates** — oscurecer ligeramente
   `#ffc52f` y `#fdb827` en `getTeamColor` (o agregar un overlay oscuro
   semitransparente detrás del texto en el banner de `GameCard.tsx`) para
   que el texto blanco con drop-shadow cumpla contraste mínimo legible.
9. **Selector de pestañas en mobile** — reemplazar la grilla apretada de 7
   botones (que baja a 10px en mobile) por un `<select>` nativo debajo de
   `sm`, manteniendo la grilla de botones en desktop. Cambio acotado a la
   sección "Tab Selector" de `GameCard.tsx`.

**Validación:** igual que la Tanda A, más una pasada de teclado (Tab +
Enter) sobre los headers colapsables para confirmar que quedaron
navegables.

**✅ Implementado.** Los headers de Harvester y Bet Tracking son `<button>`
con `aria-expanded`; el estado vacío tiene el botón "Ir al Panel de
Harvester"; `getTeamColor` cambió el color de Brewers (`#12284b`, su azul
marino oficial) y Pirates (`#27251f`, su negro oficial) — esto corrigió el
contraste en las 3 pantallas que usan esa función (banner de `GameCard`,
modal de Bet Tracking, badges del Boxscore); y GameCard usa un `<select>`
nativo para las pestañas por debajo de `sm`.

## Tanda C — Riesgo medio, requieren una decisión de layout tuya

Estos tres no son solo "arreglos"; cambian cómo se ve/organiza algo, así
que antes de tocarlos prefiero que confirmes la dirección:

10. **Orden en mobile de Bet Tracking** — hoy el formulario "Nueva Apuesta"
    aparece antes que la lista de apuestas al apilarse en una columna.
    Opciones: (a) invertir el orden solo en mobile (lista primero), o (b)
    mover "Nueva Apuesta" detrás de un botón flotante/modal en mobile y
    dejar la lista como vista principal. La (a) es más simple; la (b) se
    parece más a como se usan apps de apuestas reales pero es más trabajo.
11. **Toolbar de Bet Tracking en mobile** — colapsar "Actualizar Apuestas
    Activas" a solo ícono + tooltip por debajo de `sm`, dejando el texto
    completo en desktop. Bajo riesgo técnico, pero cambia qué tan
    descubrible es el botón en mobile — vale confirmarlo contigo.
12. **Orden del masonry de 2 columnas** — hoy `columns-1 xl:columns-2`
    llena primero toda la columna izquierda y after la derecha, así que en
    desktop ancho el orden visual por fila no coincide con el orden
    cronológico. Opciones: (a) intercalar el array antes de pintarlo
    (pares a la izquierda, impares a la derecha) para que sí coincida por
    fila, sacrificando algo del efecto "masonry" con tarjetas de altura
    despareja; o (b) pasar a un grid de 2 columnas con altura uniforme
    (pierde el efecto masonry por completo, pero el orden siempre es
    perfecto). Te preguntaría cuál preferís antes de tocarlo.

**✅ Implementado — elegiste la opción recomendada en los 3 puntos:**
orden invertido en mobile (`order-1`/`order-2`, lista primero); "Actualizar
Apuestas Activas" colapsa a solo ícono por debajo de `sm` (con
`aria-label`); y el masonry ahora reparte el array pares/impares
(`interleaveForTwoColumnMasonry`) solo cuando el viewport está en el
breakpoint `xl` (detectado con `matchMedia`, sin romper el orden natural
en 1 columna).

## Tanda D — Rendimiento (ya documentado en Fase 6, punto 3)

13. **`React.memo` en `GameCard`** + comparación por `game` sin cambios.
14. **Merge por `id` en el polling** de `App.tsx` en vez de reemplazar todo
    el array de `games` — para que `React.memo` realmente evite
    recálculos en tarjetas sin cambios.

Esta tanda ya estaba en `FASE6_RECOMENDACION_FRONTEND.md`; la dejo listada
acá para que quede en el mismo lugar que el resto del plan de frontend, por
si se quiere hacer junto con la Tanda B (toca los mismos archivos:
`App.tsx` y `GameCard.tsx`).

**✅ Implementado.** `GameCard` está envuelto en `React.memo`; `App.tsx`
tiene `mergeGamesById` (conserva la referencia de cada juego sin cambios
reales) aplicado en el polling, en `fetchLocalDB` y en el evento "done" del
harvest; y `handleRefreshGame`/`togglePin` pasaron a `useCallback` para que
las GameCard memoizadas reciban callbacks estables.

## Orden sugerido

A → B → D → C. Las tandas A y B son de bajo riesgo y no requieren
decisiones tuyas, así que se pueden hacer de una sola vez. D conviene
hacerla junto con B porque toca los mismos dos archivos. C la dejo al
final porque cada punto tiene una decisión de diseño pendiente — cuando
lleguemos ahí te pregunto cuál opción preferís antes de escribir código.

Como siempre en este proyecto: cada tanda se valida con `tsc --noEmit`
antes de entregarse, y los archivos van a tu máquina real con el mismo
mecanismo de guard por `mtime` que usamos en las fases anteriores.
