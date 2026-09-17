import { db, app } from '../config/firebase';
import { doc, collection, setDoc, getDoc, getDocs, getCountFromServer, query, where, orderBy, limit, arrayUnion, writeBatch, documentId } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

let authInitialized = false;
// Encontrado (sept. 2026): justo después de un cold-start de Render (el SDK de
// Firestore recién autenticando/abriendo su canal), una consulta real fácilmente
// tarda más de 3 segundos. Con el default anterior (3000ms), esa primera lectura
// del día llegaba tarde, `withFirestoreReadTimeout` devolvía el fallback, y el
// código de más abajo trataba ese timeout exactamente igual que "Firestore
// respondió que no hay nada" — cacheando la fecha como vacía. Resultado real:
// una fecha con 15 juegos guardados en Firestore se mostraba con 1-2 (lo que
// alcanzó a llegar en la ventana) y quedaba bloqueada así por 5 minutos
// (EMPTY_CACHE_TTL_MS) hasta que el usuario forzaba una re-extracción completa.
// 10s le da margen de sobra a una conexión fría sin volverse un timeout inútil.
const FIRESTORE_READ_TIMEOUT_MS = Number(process.env.FIRESTORE_READ_TIMEOUT_MS || 10000);

export async function ensureAnonymousAuth(): Promise<boolean> {
  if (!app) return false;
  if (authInitialized) return true;

  try {
    const auth = getAuth(app);
    await signInAnonymously(auth);
    authInitialized = true;
    return true;
  } catch (authErr: any) {
    if (authErr.code === 'auth/configuration-not-found') {
      console.error("\nERROR CRITICO DE FIREBASE: La Autenticacion Anonima no esta habilitada.");
      console.error("Ve a Firebase Console -> Authentication -> Sign-in method -> habilita 'Anonimo'.\n");
    } else {
      console.error("Error autenticando Firebase:", authErr);
    }
    return false;
  }
}

async function withFirestoreReadTimeout<T>(promise: Promise<T>, fallback: T, label: string, timeoutMs = FIRESTORE_READ_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`[Firestore] Timeout leyendo ${label} despues de ${timeoutMs}ms.`);
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Encontrado (sept. 2026): las LECTURAS ya tenían timeout (arriba), pero las
// ESCRITURAS (setDoc) no tenían ninguno. `saveGameData` hace hasta ~10 `setDoc`
// seguidos por juego, y si uno solo se cuelga (canal gRPC/WebChannel de Firestore
// que no responde, blip de red saliente de Render, etc.) el `await` nunca se
// resuelve NI rechaza — se queda esperando para siempre. Como `saveGameDataReliably`
// solo reintenta cuando `saveGameData` lanza un error, un `setDoc` colgado nunca
// dispara el reintento: congela el bucle entero de extracción (SSE) en ese juego
// exacto, sin ningún error visible en consola. Esto explica un harvest que se
// queda pegado en un juego para siempre ("no pasa de ahí") sin tirar 503 ni nada.
//
// A diferencia de las lecturas, una escritura sin confirmar no tiene un fallback
// seguro (no sabemos si Firestore la aplicó o no), así que esto RECHAZA en vez de
// resolver con un valor por defecto — para que el retry de saveGameDataReliably
// sí se entere y reintente (o falle limpio tras 3 intentos) en vez de colgarse.
const FIRESTORE_WRITE_TIMEOUT_MS = Number(process.env.FIRESTORE_WRITE_TIMEOUT_MS || 15000);

function withFirestoreWriteTimeout<T>(promise: Promise<T>, label: string, timeoutMs = FIRESTORE_WRITE_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`[Firestore] Timeout escribiendo ${label} despues de ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

/** setDoc con timeout — usar en vez de setDoc directo para cualquier escritura dentro del harvest. */
function setDocWithTimeout(ref: any, data: any, options?: any): Promise<void> {
  const label = `${ref?.parent?.id ?? "doc"}/${ref?.id ?? "?"}`;
  const p: Promise<void> = options !== undefined ? setDoc(ref, data, options) : setDoc(ref, data);
  return withFirestoreWriteTimeout(p, label);
}

// Límite para el historial de `snapshots` (ver saveGameData más abajo): sin esto,
// cada llamada a saveGameData —incluyendo refrescos livianos y reintentos— creaba
// un documento nuevo para siempre, siendo la mayor fuente de consumo de cuota.
// Con esto, un juego que se refresca cada pocos minutos durante horas solo genera
// un puñado de snapshots reales en vez de decenas.
//
// Vive en memoria del proceso (se resetea con cada redeploy de Render) — es
// intencional: evita una lectura extra a Firestore por juego solo para saber
// cuándo fue el último snapshot, y el único costo de resetear es, como mucho, un
// snapshot de más justo después de un deploy.
const SNAPSHOT_MIN_INTERVAL_MS = Number(process.env.FIRESTORE_SNAPSHOT_MIN_INTERVAL_MS || 15 * 60 * 1000); // 15 min
const lastSnapshotInfo = new Map<string, { at: number; status: any }>();

export const saveGameData = async (gameId: string, gameData: any) => {
  try {
    if (!db || !app) {
      console.warn("Firestore db is not initialized. Skipping Firestore save.");
      return;
    }

    if (!authInitialized) {
      try {
        const auth = getAuth(app);
        await signInAnonymously(auth);
        authInitialized = true;
      } catch (authErr: any) {
        if (authErr.code === 'auth/configuration-not-found') {
          console.error("\n❌ ERROR CRÍTICO DE FIREBASE: La Autenticación Anónima no está habilitada.");
          console.error("👉 Ve a tu Consola de Firebase -> Authentication -> Sign-in method -> Habilita 'Anónimo'.");
          console.error("El backend no puede guardar los juegos en la nube sin esto debido a tus reglas de seguridad.\n");
        } else {
          console.error("Error autenticando el backend:", authErr);
        }
        return; // Stop saving if auth fails
      }
    }

    const now = new Date().toISOString();
    const dataWithTimestamp = { ...gameData, timestamp: now };

    // Set with merge: true to avoid overwriting fields not provided in this update
    const gameRef = doc(collection(db, 'games'), gameId);
    await setDocWithTimeout(gameRef, dataWithTimestamp, { merge: true });

    // Encontrado (sept. 2026): las 8 subcolecciones que antes se escribían aquí
    // (weather, line_movements, betting_history, offensive_splits, fatigue_metrics,
    // advanced_pitching, advanced_offense, model_features, game_result) nunca se
    // leen en ningún otro lado del código — todo lo que la app lee viene del
    // documento principal de arriba, que ya incluye estos mismos campos vía el
    // spread de `gameData`. Eran ~8 escrituras duplicadas por juego sin ningún
    // consumidor, quemando cuota de Firestore por nada. Se eliminaron.
    // (El único subcamino que sí guardaba algo que no estaba ya en el documento
    // principal era el historial en `snapshots`, que se mantiene abajo con límite.)

    // Save historical snapshot — con límite para no crecer sin control ni quemar
    // cuota: solo se guarda un snapshot nuevo si pasó al menos
    // FIRESTORE_SNAPSHOT_MIN_INTERVAL_MS desde el último para este juego, o si el
    // estado del juego cambió desde el último snapshot (ej. pasó a "Final") —
    // eso sí queremos capturarlo siempre, sin esperar al intervalo.
    const currentStatus = gameData?.game_result?.gameStatus;
    const prevSnapshotInfo = lastSnapshotInfo.get(gameId);
    const elapsedSinceLastSnapshot = prevSnapshotInfo ? Date.now() - prevSnapshotInfo.at : Infinity;
    const statusChangedSinceLastSnapshot = !prevSnapshotInfo || prevSnapshotInfo.status !== currentStatus;
    const shouldSnapshot = !prevSnapshotInfo
      || elapsedSinceLastSnapshot >= SNAPSHOT_MIN_INTERVAL_MS
      || statusChangedSinceLastSnapshot;

    if (shouldSnapshot) {
      const snapshotRef = doc(collection(gameRef, 'snapshots'), now);
      await setDocWithTimeout(snapshotRef, dataWithTimestamp);
      lastSnapshotInfo.set(gameId, { at: Date.now(), status: currentStatus });
    }

    // Registrar la fecha en el documento de metadatos ligero de forma atómica
    const date = gameData?.metadata?.date;
    if (date) {
      const metadataRef = doc(db, 'metadata', 'extracted_dates');
      await setDocWithTimeout(metadataRef, {
        dates: arrayUnion(date)
      }, { merge: true });
    }

    console.log(`Successfully saved game ${gameId} and snapshot to Firestore.`);
  } catch (error) {
    console.error(`Error saving game ${gameId} to Firestore:`, error);
    throw error;
  }
};

export const loadAllGamesFromFirestore = async (): Promise<any[]> => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];

    console.log("Cargando juegos desde Firestore...");
    const gamesColl = collection(db, 'games');
    const snapshot = await withFirestoreReadTimeout(getDocs(gamesColl), null, 'todos los juegos');
    if (!snapshot) return [];
    
    const games: any[] = [];
    snapshot.forEach((doc) => {
      games.push(doc.data());
    });

    console.log(`Se cargaron exitosamente ${games.length} juegos desde Firestore.`);
    return games;
  } catch (error) {
    console.error("Error al cargar juegos de Firestore:", error);
    return [];
  }
};

const emptyCache = new Map<string, number>();
const EMPTY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Sentinel exclusivo para distinguir, en `withFirestoreReadTimeout`, "Firestore
// respondió y de verdad no hay nada" (fallback legítimo, tiene sentido cachearlo
// como negativo) de "no llegó respuesta a tiempo" (sobre todo el primer request
// tras un cold-start, con el SDK todavía autenticando). Antes ambos casos
// devolvían el mismo `null` y se cacheaban igual — un timeout aislado dejaba una
// fecha con juegos reales en Firestore marcada como "vacía" por 5 minutos
// (EMPTY_CACHE_TTL_MS), exactamente el bug reportado el 2026-09-09 (una fecha con
// 15 juegos guardados se veía con 1-2 hasta forzar una re-extracción completa).
const FIRESTORE_TIMEOUT = Symbol('firestore-timeout');

export const loadGamesByDateFromFirestore = async (date: string): Promise<any[]> => {
  try {
    // 1. Revisar Caché Negativo Local
    const now = Date.now();
    if (emptyCache.has(date) && (now - emptyCache.get(date)!) < EMPTY_CACHE_TTL_MS) {
      console.log(`[Caché] Día vacío en caché para ${date}, abortando consulta a Firebase instantáneamente.`);
      return [];
    }

    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore date load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];

    // 2. Revisión Rápida de Metadatos (Fast Check)
    const metadataRef = doc(db, 'metadata', 'extracted_dates');
    const metaSnapshot = await withFirestoreReadTimeout<any>(getDoc(metadataRef), FIRESTORE_TIMEOUT, 'metadatos de fechas rápidas');
    if (metaSnapshot === FIRESTORE_TIMEOUT) {
      console.warn(`[Firestore] Timeout leyendo metadatos para ${date}; se omite el atajo rápido pero se sigue con la query completa (sin cachear como vacío).`);
    } else if (metaSnapshot && metaSnapshot.exists()) {
      const dates = metaSnapshot.data()?.dates || [];
      if (!dates.includes(date)) {
        console.log(`[Optimización] La fecha ${date} no está en metadatos. Evitando query completo.`);
        emptyCache.set(date, now); // Guardar en caché negativo
        return [];
      }
    }

    const gamesQuery = query(collection(db, 'games'), where('metadata.date', '==', date));
    const snapshot = await withFirestoreReadTimeout<any>(getDocs(gamesQuery), FIRESTORE_TIMEOUT, `juegos de ${date}`);
    if (snapshot === FIRESTORE_TIMEOUT) {
      // No cachear: es un "no sabemos", no un "no hay nada". El próximo request
      // (con el SDK ya autenticado/con el canal abierto) puede resolver bien.
      console.warn(`[Firestore] Timeout consultando juegos de ${date}; devolviendo vacío SOLO para este request, sin bloquear reintentos.`);
      return [];
    }
    if (!snapshot || snapshot.empty) {
      emptyCache.set(date, now); // Si la query real también vuelve vacía, guardamos en caché negativo
      return [];
    }

    const games: any[] = [];
    snapshot.forEach((doc) => {
      games.push(doc.data());
    });
    console.log(`Se cargaron ${games.length} juegos desde Firestore para ${date}.`);
    return games;
  } catch (error) {
    console.error(`Error al cargar juegos de Firestore para ${date}:`, error);
    return [];
  }
};

export const loadGamesByDateRangeFromFirestore = async (startDate: string, endDate: string): Promise<any[]> => {
  try {
    if (!db) return [];
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];

    const gamesQuery = query(
      collection(db, "games"),
      where("metadata.date", ">=", startDate),
      where("metadata.date", "<=", endDate),
      orderBy("metadata.date", "asc"),
    );
    const snapshot = await withFirestoreReadTimeout(getDocs(gamesQuery), null, `juegos entre ${startDate} y ${endDate}`, 20000);
    if (!snapshot) throw new Error("Firestore no respondió dentro de 20 segundos");
    return snapshot.docs.map((gameDocument) => gameDocument.data());
  } catch (error) {
    console.error(`[Firestore] Error leyendo rango ${startDate}..${endDate}:`, error);
    throw error;
  }
};

export const loadLatestGamesFromFirestore = async (): Promise<any[]> => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore latest load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];

    const latestQuery = query(collection(db, 'games'), orderBy('metadata.date', 'desc'), limit(1));
    const latestSnapshot = await withFirestoreReadTimeout(getDocs(latestQuery), null, 'fecha mas reciente');
    if (!latestSnapshot) return [];
    const latestDate = latestSnapshot.docs[0]?.data()?.metadata?.date;
    if (!latestDate) return [];
    return loadGamesByDateFromFirestore(latestDate);
  } catch (error) {
    console.error("Error al cargar la fecha mÃ¡s reciente desde Firestore:", error);
    return [];
  }
};

export const loadExtractedDatesFromFirestore = async (): Promise<string[]> => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore dates load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];

    // Intentar leer el documento de metadatos ligero primero
    const metadataRef = doc(db, 'metadata', 'extracted_dates');
    const metaSnapshot = await withFirestoreReadTimeout(getDoc(metadataRef), null, 'metadatos de fechas');
    if (metaSnapshot && metaSnapshot.exists()) {
      const dates = metaSnapshot.data()?.dates || [];
      // Ordenar descendente por fecha
      return [...dates].sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
    }

    // Fallback: si no existe el documento de metadatos, hacemos la consulta pesada
    console.log("[Firestore] Documento metadata/extracted_dates no encontrado. Usando fallback pesado...");
    const datesQuery = query(collection(db, 'games'), orderBy('metadata.date', 'desc'));
    const snapshot = await withFirestoreReadTimeout(getDocs(datesQuery), null, 'fechas extraidas');
    if (!snapshot) return [];

    const dates = new Set<string>();
    snapshot.forEach((doc) => {
      const date = doc.data()?.metadata?.date;
      if (typeof date === 'string' && date) dates.add(date);
    });

    return Array.from(dates);
  } catch (error) {
    console.error("Error al cargar fechas extraidas desde Firestore:", error);
    return [];
  }
};

// Sept. 2026 — auditoría con el usuario, punto #1 ("el backfill no queda resuelto
// de una vez por todas"): pitcher_stats_pit.json / offense_stats_pit.json /
// boxscore_game_stats.json (generados por backfill_pitcher_stats_pit.py) NUNCA
// tuvieron el mismo tratamiento que mlb_database.json. El disco local de Render
// es efímero (se borra en cada redeploy — ver comentario en server.ts junto a
// runStartupFirestoreSync); mlb_database.json sobrevive a eso porque cada guardado
// se replica aquí y se restaura al arrancar, pero estos 3 archivos PIT solo vivían
// en el disco local, así que cada redeploy los revertía a lo último commiteado en
// git — sin importar que el backfill automático (ver runBackfillPitSubprocess en
// cronPipelineRoutes.ts) sí corriera bien en cada extracción. Estas dos funciones
// replican para PIT el mismo patrón que ya funciona para juegos: cada entrada
// (keyed por game_id) es su propio documento en una colección `pit_<kind>`, para
// no chocar con el límite de 1MB por documento de Firestore (los 3 archivos
// combinados ya pesan >4MB) y para poder subir/bajar solo lo que cambió.
export const savePitLookupEntries = async (
  kind: 'pitchers' | 'offense' | 'boxscore',
  entries: Record<string, any>
): Promise<{ saved: number; failed: number }> => {
  const keys = Object.keys(entries || {});
  if (keys.length === 0) return { saved: 0, failed: 0 };
  if (!db || !app) {
    console.warn("Firestore db is not initialized. Skipping PIT save.");
    return { saved: 0, failed: keys.length };
  }
  const isAuthed = await ensureAnonymousAuth();
  if (!isAuthed) return { saved: 0, failed: keys.length };

  const collName = `pit_${kind}`;
  let saved = 0;
  let failed = 0;
  // writeBatch soporta hasta 500 operaciones — se usan 400 para dejar margen.
  const BATCH_SIZE = 400;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const chunk = keys.slice(i, i + BATCH_SIZE);
    try {
      const batch = writeBatch(db);
      for (const key of chunk) {
        const ref = doc(collection(db, collName), key);
        batch.set(ref, entries[key], { merge: true });
      }
      await withFirestoreWriteTimeout(batch.commit(), `${collName} batch@${i}`);
      saved += chunk.length;
    } catch (error) {
      console.error(`[Firestore PIT] Error guardando batch de ${collName} (offset ${i}):`, error);
      failed += chunk.length;
    }
  }
  return { saved, failed };
};

export const loadAllPitLookupEntries = async (
  kind: 'pitchers' | 'offense' | 'boxscore'
): Promise<Record<string, any>> => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping PIT load.");
      return {};
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return {};

    const collName = `pit_${kind}`;
    const snapshot = await withFirestoreReadTimeout(getDocs(collection(db, collName)), null, collName, 20000);
    if (!snapshot) return {};

    const result: Record<string, any> = {};
    snapshot.forEach((docSnap) => {
      result[docSnap.id] = docSnap.data();
    });
    return result;
  } catch (error) {
    console.error(`[Firestore PIT] Error cargando pit_${kind}:`, error);
    return {};
  }
};

// Sept. 2026 — encontrado auditando por qué el consumo de lecturas de Firestore
// se disparó (~15 mil lecturas en una sola mañana): `loadAllPitLookupEntries`
// de arriba escanea la colección COMPLETA (`pit_pitchers`/`pit_offense`/
// `pit_boxscore`, ~2300-2500 documentos cada una) y `restorePitFilesFromFirestore`
// (server.ts) la llamaba en CADA arranque del proceso — no solo al hacer deploy,
// sino en cada reinicio, incluidos los que dispara un crash. La mañana del
// 2026-09-17 el servicio se reinició 3 veces por el mismo crash de memoria
// (exit 134) que ya se había diagnosticado el día anterior — cada reinicio
// repitió el escaneo completo de las 3 colecciones (~7200 documentos), lo que
// por sí solo explica (y supera) las ~15 mil lecturas reportadas, sin contar el
// resto del tráfico normal. Es exactamente el mismo patrón que `mlb_database.json`
// (un archivo/colección gigante releído entero en cada operación) que ya se
// había corregido para `games` — acá quedó pendiente porque esta persistencia
// PIT se agregó después, en una sesión separada.
//
// Esta versión solo trae los gameIds puntuales que hacen falta (la ventana de
// juegos recién restaurada en el arranque, o un solo juego bajo demanda) en vez
// de la colección entera — usa el operador `in` de Firestore en tandas de hasta
// 30 ids (límite actual del SDK).
const FIRESTORE_IN_CHUNK_SIZE = 30;

export const loadPitLookupEntriesForIds = async (
  kind: 'pitchers' | 'offense' | 'boxscore',
  gameIds: string[]
): Promise<Record<string, any>> => {
  const ids = Array.from(new Set((gameIds || []).filter(Boolean).map(String)));
  if (ids.length === 0) return {};
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping PIT load.");
      return {};
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return {};

    const collName = `pit_${kind}`;
    const result: Record<string, any> = {};
    for (let i = 0; i < ids.length; i += FIRESTORE_IN_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + FIRESTORE_IN_CHUNK_SIZE);
      const idsQuery = query(collection(db, collName), where(documentId(), 'in', chunk));
      const snapshot = await withFirestoreReadTimeout(getDocs(idsQuery), null, `${collName} (${chunk.length} id(s))`, 15000);
      if (!snapshot) continue;
      snapshot.forEach((docSnap: any) => {
        result[docSnap.id] = docSnap.data();
      });
    }
    return result;
  } catch (error) {
    console.error(`[Firestore PIT] Error cargando ${ids.length} id(s) de pit_${kind}:`, error);
    return {};
  }
};

export const getTotalGamesCountFromFirestore = async (): Promise<number> => {
  try {
    if (!db || !app) return 0;
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return 0;

    const snapshot = await withFirestoreReadTimeout(getCountFromServer(collection(db, 'games')), null, 'conteo de juegos');
    if (!snapshot) return 0;
    return snapshot.data().count;
  } catch (error) {
    console.error("Error al contar juegos en Firestore:", error);
    return 0;
  }
};
