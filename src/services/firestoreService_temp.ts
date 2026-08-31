/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * Nombre "_temp" sugiere que ya era un experimento. No lo importa ningún
 * archivo del proyecto (verificado con grep en todo `src/` y `server.ts`).
 * La app en producción no usa Firestore/Firebase para persistencia — usa
 * archivos JSON locales (`mlb_database.json`, etc.) vía `fs`.
 *
 * Se deja en su lugar porque esta sesión no puede mover/eliminar archivos
 * en tu máquina — ver el mensaje de la Fase 4 para el comando manual.
 */
import { db, app } from '../config/firebase';
import { getCountFromServer, collection } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

let authInitialized = false;

export const getTotalGamesCountFromFirestore = async (): Promise<number> => {
  try {
    if (!db || !app) return 0;
    
    if (!authInitialized) {
      try {
        const auth = getAuth(app);
        await signInAnonymously(auth);
        authInitialized = true;
      } catch (e) {
        // Ignorar error de auth aqui, puede fallar si no esta activado.
      }
    }

    const snapshot = await getCountFromServer(collection(db, 'games'));
    return snapshot.data().count;
  } catch (error) {
    console.error("Error al contar juegos en Firestore:", error);
    return 0;
  }
};
