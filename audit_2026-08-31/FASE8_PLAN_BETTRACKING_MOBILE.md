# Fase 8 — Reducir la sensación de "cargado" en Bet Tracking mobile

**Estado: las 2 tandas (A, B) están implementadas, validadas con
`tsc --noEmit` y entregadas a la máquina real.** Las notas de cada tanda se
dejan como estaban al proponerlas; al final de cada una hay un resumen de
lo que efectivamente se implementó.

Sigue a la auditoría de diseño de Bet Tracking en mobile. Ninguno de estos
cambios quita información esencial (asunto, monto, estado, progreso en
vivo de una apuesta pendiente); todos son de layout/densidad. Se organizan
en 2 tandas por riesgo, igual que la Fase 7.

## Tanda A — Bajo riesgo, cambios de CSS puros

Ninguno de estos 4 puntos toca estado ni restructura componentes.

1. **Sacar el scroll interno de la lista en mobile** — `BetList.tsx` tiene
   `max-h-[680px] overflow-y-auto` siempre activo. En mobile eso encierra
   las apuestas en un cajón con scroll propio en vez de dejar que la página
   fluya normalmente. Cambiarlo a que el `max-h`/`overflow-y-auto` solo
   aplique desde `lg:` (donde sí tiene sentido, al lado del wizard), y que
   en mobile la lista fluya con el resto de la página.
2. **Ocultar la barra de progreso en tarjetas colapsadas ya resueltas** —
   hoy toda tarjeta colapsada muestra `<LiveProgressBar compact />`, incluso
   para apuestas ganadas/perdidas/nulas, donde el badge de estado ya dice
   todo. Mostrarla solo cuando `bet.status === "pending"`.
3. **Compactar las tarjetas de resumen en mobile** — el grid 2x2 de "En
   juego / Ganadas / Perdidas / Neto" (cada una con su propia tarjeta con
   borde, ícono y fondo de color) pesa bastante para ser el primer bloque
   que se ve. En mobile, reemplazarlo por una sola fila compacta de 4
   números con su etiqueta arriba, sin tarjetas individuales; desde `sm:`
   mantener el diseño actual con tarjetas.
4. **Blindar la fila de filtros de estado contra overflow** — el
   contenedor de los pills "Todas/Pendientes/Ganadas/Perdidas" no tiene
   `flex-wrap` ni `overflow-x-auto`; en un teléfono angosto (320–375px)
   puede no entrar. Agregar `overflow-x-auto` como red de seguridad.

**Validación:** `tsc --noEmit` + revisión visual, igual que las fases
anteriores.

**✅ Implementado.** En `BetList.tsx`: el `max-h-[680px] overflow-y-auto`
ahora solo aplica desde `lg:` (`lg:max-h-[680px] lg:overflow-y-auto`), así
que en mobile la lista fluye con el resto de la página; la barra de
progreso compacta en tarjetas colapsadas solo se muestra cuando
`bet.status === "pending"`; la fila de filtros de estado tiene
`overflow-x-auto` como red de seguridad, con `shrink-0` en los pills y en
el botón de expandir/colapsar todo para que no se compriman. En
`BetTracking.tsx`: las tarjetas de resumen (En juego/Ganadas/Perdidas/Neto)
se compactaron en mobile a una sola fila de 4 números con su etiqueta
arriba (`grid grid-cols-4 gap-2 sm:hidden`), manteniendo el diseño actual
con tarjetas desde `sm:` (`hidden sm:grid`).

## Tanda B — Riesgo medio, cambios estructurales

5. **Tarjeta expandida en una sola columna en mobile** — hoy la vista
   expandida pone dos columnas lado a lado (info de la apuesta a la
   izquierda, monto/odds/fecha/acciones a la derecha) compitiendo por
   ancho. En mobile pasar a un layout apilado (`flex-col sm:flex-row`) —
   primero la info de la apuesta, después el bloque de monto/odds/acciones
   en una fila propia. Desde `sm:` se mantiene el layout de 2 columnas
   actual.
6. **Wizard "Nueva Apuesta" colapsable en mobile** — hoy el formulario
   completo se renderiza siempre, ocupando espacio de scroll debajo de la
   lista aunque el usuario solo quiera revisar apuestas. Proponer un botón
   compacto "+ Nueva apuesta" que lo despliega, colapsado por defecto en
   mobile cuando ya hay al menos una apuesta cargada ese día (si no hay
   ninguna, se muestra expandido de entrada para no esconder el único CTA
   útil en una lista vacía). Desde `sm:` se mantiene siempre visible como
   hoy, ya que ahí no compite tanto por espacio.

**Validación:** igual que la Tanda A, más una revisión manual del flujo de
armar una apuesta nueva end-to-end en mobile después del cambio.

**✅ Implementado.** En `BetList.tsx`, la tarjeta expandida pasa a
`flex-col sm:flex-row` — primero la info de la apuesta, después el bloque
de usuario/monto/odds/fecha/acciones en su propia fila (separada por un
borde superior sutil en mobile), manteniendo el layout de 2 columnas
actual desde `sm:`. En `BetTracking.tsx`, el wizard "Nueva Apuesta" ahora
tiene un estado `isWizardOpen` (colapsado por defecto si ya hay apuestas
cargadas ese día, expandido si la lista está vacía); el título del wizard
es un botón con un chevron que rota y permite togglear el colapso solo en
mobile (`sm:hidden` en el ícono, el toggle no hace nada relevante desde
`sm:` porque ahí el panel siempre está visible); el grupo de botones
"Smart Paste"/"Cancelar edición" y el bloque completo del formulario
(Smart Paste panel + pasos + `<form>`) quedan ocultos en mobile cuando el
wizard está colapsado, y `editBet` fuerza `setIsWizardOpen(true)` para que
editar una apuesta siempre reabra el wizard aunque estuviera colapsado.

## Orden sugerido

A → B. La Tanda A es puramente visual y de bajo riesgo — se puede hacer de
una sola vez. La Tanda B toca la estructura de la tarjeta expandida y
agrega un estado nuevo (wizard colapsado/expandido), así que conviene
revisarla con más calma después de ver la A ya funcionando.

Como siempre: cada tanda se valida con `tsc --noEmit` antes de entregarse,
y los archivos van a tu máquina real con el mismo mecanismo de guard por
`mtime` que usamos en las fases anteriores.
