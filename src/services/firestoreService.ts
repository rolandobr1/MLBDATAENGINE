import { db, app } from '../config/firebase';
import { doc, collection, setDoc, getDocs, getCountFromServer, query, where, orderBy, limit } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

let authInitialized = false;
const FIRESTORE_READ_TIMEOUT_MS = Number(process.env.FIRESTORE_READ_TIMEOUT_MS || 3000);

async function ensureAnonymousAuth(): Promise<boolean> {
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

async function withFirestoreReadTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`[Firestore] Timeout leyendo ${label} despues de ${FIRESTORE_READ_TIMEOUT_MS}ms.`);
          resolve(fallback);
        }, FIRESTORE_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

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
    await setDoc(gameRef, dataWithTimestamp, { merge: true });

    // Save subcollections
    if (gameData.weather) {
      const weatherRef = doc(collection(gameRef, 'weather'), 'current');
      await setDoc(weatherRef, gameData.weather);
    }
    if (gameData.line_movements && gameData.line_movements.length > 0) {
      const lastLine = gameData.line_movements[gameData.line_movements.length - 1];
      if (lastLine) {
        const lineId = lastLine.timestamp ? String(lastLine.timestamp).replace(/[:.]/g, '-') : String(Date.now());
        const lineRef = doc(collection(gameRef, 'line_movements'), lineId);
        await setDoc(lineRef, lastLine);
      }
    }
    if (gameData.offensive_splits) {
      const splitsRef = doc(collection(gameRef, 'offensive_splits'), 'current');
      await setDoc(splitsRef, gameData.offensive_splits);
    }
    if (gameData.fatigue_metrics) {
      const fatigueRef = doc(collection(gameRef, 'fatigue_metrics'), 'current');
      await setDoc(fatigueRef, gameData.fatigue_metrics);
    }
    if (gameData.advanced_pitching) {
      const advPitchingRef = doc(collection(gameRef, 'advanced_pitching'), 'current');
      await setDoc(advPitchingRef, gameData.advanced_pitching);
    }
    if (gameData.advanced_offense) {
      const advOffenseRef = doc(collection(gameRef, 'advanced_offense'), 'current');
      await setDoc(advOffenseRef, gameData.advanced_offense);
    }
    if (gameData.model_features) {
      const featuresRef = doc(collection(gameRef, 'model_features'), 'current');
      await setDoc(featuresRef, gameData.model_features);
    }
    if (gameData.game_result) {
      const resultRef = doc(collection(gameRef, 'game_result'), 'current');
      await setDoc(resultRef, gameData.game_result);
    }

    // Save historical snapshot
    const snapshotRef = doc(collection(gameRef, 'snapshots'), now);
    await setDoc(snapshotRef, dataWithTimestamp);

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

export const loadGamesByDateFromFirestore = async (date: string): Promise<any[]> => {
  try {
    if (!db) {
      console.warn("Firestore db is not initialized. Skipping Firestore date load.");
      return [];
    }
    const isAuthed = await ensureAnonymousAuth();
    if (!isAuthed) return [];

    const gamesQuery = query(collection(db, 'games'), where('metadata.date', '==', date));
    const snapshot = await withFirestoreReadTimeout(getDocs(gamesQuery), null, `juegos de ${date}`);
    if (!snapshot) return [];
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
