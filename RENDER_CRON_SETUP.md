# Automatizar el pipeline en Render (Fase 3, punto 1)

Este documento explica cómo conectar el endpoint `/api/cron/run-daily-pipeline`
(agregado en `server.ts`, Fase 3 del plan de mejora) a un **Cron Job de Render**
para que la extracción + backfill PIT + export + validación corran solas todos
los días, sin depender de que abras la app manualmente.

## Por qué esta arquitectura (y no un Cron Job "de infraestructura" separado)

Un Cron Job de Render corre en su **propio contenedor efímero**, sin acceso al
disco de tu Web Service (donde vive `mlb_database.json`, `pitcher_stats_pit.json`,
los CSV exportados, etc.). Si el pipeline corriera ahí, no vería ni podría
escribir esos archivos.

Por eso el Cron Job de Render **no ejecuta el pipeline directamente** — solo
dispara, con un simple `curl`, un endpoint protegido dentro de tu Web Service ya
desplegado. El pipeline entero (extracción → backfill PIT → export → validación)
corre dentro del mismo proceso Node que ya tiene el disco, exactamente como
cuando lo disparas manualmente desde la UI.

## 1. Configurar el secreto

En el dashboard de Render, en tu **Web Service** (el que corre `server.ts`),
agrega una variable de entorno:

```
CRON_SECRET=<genera un valor largo y aleatorio, ej. con `openssl rand -hex 32`>
```

Si `CRON_SECRET` no está configurada, el endpoint responde `503` y se niega a
correr — es un fail-safe para que este endpoint nunca quede abierto por
accidente en producción.

## 2. Crear el Cron Job en Render

En el dashboard: **New +** → **Cron Job**.

- **Command**:
  ```bash
  curl -fsS -X POST "$APP_URL/api/cron/run-daily-pipeline" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```
  (Agrega `APP_URL` y `CRON_SECRET` como variables de entorno de este Cron Job
  también — `APP_URL` es la URL pública de tu Web Service, ej.
  `https://mlbdataengine.onrender.com`, y `CRON_SECRET` debe ser el mismo valor
  que configuraste en el paso 1.)
- **Schedule**: Render usa cron estándar en **UTC**. Para correr todos los días
  a las 3:00 AM hora del Este (cuando ya terminaron los juegos del día,
  incluyendo los de la costa oeste):
  - Horario de verano (EDT, UTC-4): `0 7 * * *`
  - Horario estándar (EST, UTC-5): `0 8 * * *`

  Render no ajusta el cron automáticamente por horario de verano — vas a tener
  que cambiar la expresión dos veces al año, o simplemente dejar `0 8 * * *`
  todo el año (en EDT correría a las 4:00 AM en vez de las 3:00 AM, que sigue
  siendo después de que terminen los juegos).

El body `{}` hace que el endpoint procese la fecha de **hoy** (calculada en
hora de Nueva York, igual que el resto de la app). Si alguna vez quieres
disparar una fecha específica manualmente (para reprocesar un día puntual),
podés llamarlo con `-d '{"date":"2026-08-30"}'`.

## 3. Verificar que corrió

El endpoint responde de inmediato con `202 Accepted` y un `runId` — el
pipeline sigue corriendo en segundo plano después de esa respuesta, porque
puede tardar varios minutos (rate limit de la API de MLB). Para ver el
resultado real de la corrida:

```bash
curl "$APP_URL/api/cron/runs?limit=5" -H "X-Cron-Secret: $CRON_SECRET"
```

Esto devuelve las últimas corridas registradas en `pipeline_runs.json`
(Fase 3, punto 4), con cada paso (extracción, backfill_pit, export_csv,
validacion), su estado (`ok` / `error`), y el detalle de cada uno —
incluyendo el resultado de `validate_dataset.ts` (fallas críticas, avisos,
rachas congeladas si las hubiera).

## ⚠️ Dependencia sin verificar: Python en el Web Service

El paso de backfill PIT ejecuta `backfill_pitcher_stats_pit.py` como
subproceso (`python3 backfill_pitcher_stats_pit.py --from_date <fecha>`)
**dentro del mismo Web Service de Node**. No tuve forma de confirmar desde
aquí si el entorno nativo de Node de Render incluye `python3` — muchos lo
traen porque `node-gyp` lo necesita para compilar dependencias nativas, pero
no es una garantía documentada.

Cómo confirmarlo vos: después de desplegar este cambio, disparás el endpoint
una vez y revisás `/api/cron/runs` — si el paso `backfill_pit` sale con
`status: "error"` y el mensaje menciona algo como `spawn python3 ENOENT`,
significa que Python no está disponible en ese entorno. El pipeline **no se
cae por esto** (el diseño es a prueba de fallos: si el backfill falla, igual
se exporta el CSV con la cobertura PIT que ya exista y se deja constancia del
error), pero no vas a ganar cobertura PIT nueva hasta resolverlo.

Si falta Python, las opciones son: (a) cambiar el Web Service a un entorno
Docker con una imagen que incluya Node y Python juntos (necesitarías un
`Dockerfile` — no lo armé porque no sé si querés migrar de la build nativa
de Render a Docker), o (b) portar la lógica de `backfill_pitcher_stats_pit.py`
a TypeScript en una fase futura para eliminar la dependencia de Python por
completo. Si me confirmás cuál preferís, lo armo en la próxima fase.

Si en vez de esto la app corre solo en tu máquina Windows por ahora, avisame
y armamos el `.bat`/Programador de tareas de Windows en su lugar — ese
enfoque no tiene este problema porque Python y Node ya conviven en tu máquina.
