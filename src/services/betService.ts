import { db, app } from '../config/firebase';
import { doc, setDoc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const BETS_COLLECTION = 'mlb_bets';
const USERS_DOC = 'mlb_users/registered';

let authInitialized = false;

async function ensureAnonymousAuth(): Promise<boolean> {
  if (!app || !db) return false;
  if (authInitialized) return true;

  try {
    const auth = getAuth(app);
    await signInAnonymously(auth);
    authInitialized = true;
    return true;
  } catch (authErr: any) {
    if (authErr.code === 'auth/configuration-not-found') {
      console.error("Firebase Anonymous Auth no esta habilitada; no se pueden sincronizar apuestas.");
    } else {
      console.error("Error autenticando Firebase para apuestas:", authErr);
    }
    return false;
  }
}

export const syncUsers = (callback: (users: string[]) => void) => {
  if (!db) return () => {};
  let unsubscribe = () => {};
  let isActive = true;

  ensureAnonymousAuth().then((isAuthed) => {
    if (!isActive) return;
    if (!isAuthed) {
      callback([]);
      return;
    }

    const usersRef = doc(db, USERS_DOC);
    unsubscribe = onSnapshot(usersRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        callback(data.list || []);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error("Error sincronizando usuarios de apuestas:", error);
    });
  });

  return () => {
    isActive = false;
    unsubscribe();
  };
};

export const registerUserDb = async (name: string) => {
  if (!db || !name.trim()) return;
  const isAuthed = await ensureAnonymousAuth();
  if (!isAuthed) return;

  const usersRef = doc(db, USERS_DOC);
  const docSnap = await getDoc(usersRef);
  let list: string[] = [];
  if (docSnap.exists()) {
    list = docSnap.data().list || [];
  }
  if (!list.includes(name.trim())) {
    list.push(name.trim());
    await setDoc(usersRef, { list: list.sort() }, { merge: true });
  }
};

export const deleteUserDb = async (name: string) => {
  if (!db || !name.trim()) return;
  const isAuthed = await ensureAnonymousAuth();
  if (!isAuthed) return;

  const usersRef = doc(db, USERS_DOC);
  const docSnap = await getDoc(usersRef);
  if (docSnap.exists()) {
    const list: string[] = docSnap.data().list || [];
    const updated = list.filter(u => u !== name.trim());
    await setDoc(usersRef, { list: updated }, { merge: true });
  }
};

export const syncBets = (date: string, callback: (bets: any[]) => void) => {
  if (!db) return () => {};
  let unsubscribe = () => {};
  let isActive = true;

  ensureAnonymousAuth().then((isAuthed) => {
    if (!isActive) return;
    if (!isAuthed) {
      callback([]);
      return;
    }

    const dateDocRef = doc(db, BETS_COLLECTION, date);
    unsubscribe = onSnapshot(dateDocRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data().bets || []);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error(`Error sincronizando apuestas para ${date}:`, error);
    });
  });

  return () => {
    isActive = false;
    unsubscribe();
  };
};

/**
 * Guarda el array de apuestas de una fecha.
 *
 * Encontrado (sept. 2026): el documento `mlb_bets/{date}` guarda las apuestas
 * de TODOS los usuarios en un solo campo `bets` (array). `setDoc(..., {merge:
 * true})` solo protege otros campos del documento — el valor del array `bets`
 * en si se REEMPLAZA por completo en cada guardado, no se fusiona elemento a
 * elemento. Con dos pestañas abiertas a la vez (ej. la app del usuario en su
 * compu + una sesión de registro por Smart Paste), cada una tiene su propia
 * copia de `bets` en memoria; si la pestaña A guarda apuestas nuevas y luego
 * la pestaña B guarda cualquier cambio (incluido el auto-grading de estados
 * en vivo, que corre automático cuando un juego termina — ver el useEffect de
 * "Auto-resolve" en BetTracking.tsx) usando su copia vieja (sin las apuestas
 * de A), esa escritura borra silenciosamente lo que A acababa de agregar.
 * Reportado el 2026-09-10: 6 apuestas registradas para "R-Seguimiento"
 * desaparecieron así al terminar unos juegos con la app abierta en paralelo.
 *
 * Fix: en vez de mandar el array completo tal cual lo tiene esta pestaña,
 * mandamos también `prevBets` (el array ANTES del cambio que esta pestaña
 * está por guardar) y calculamos, dentro de una transacción, solo la
 * diferencia real que esta pestaña quiso hacer (qué id agregó, edito o
 * borró comparando prevBets vs bets). Esa diferencia se aplica sobre lo que
 * el servidor tenga en ese momento — no sobre la copia local vieja — así que
 * apuestas agregadas o editadas por otra pestaña entre medio nunca se pisan.
 */
export const saveBetsDb = async (date: string, prevBets: any[], bets: any[]) => {
  if (!db) return;
  const isAuthed = await ensureAnonymousAuth();
  if (!isAuthed) return;

  const dateDocRef = doc(db, BETS_COLLECTION, date);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(dateDocRef);
    const serverBets: any[] = snap.exists() ? (snap.data().bets || []) : [];

    const prevById = new Map(prevBets.map((b: any) => [b.id, b]));
    const nextById = new Map(bets.map((b: any) => [b.id, b]));
    const merged = new Map(serverBets.map((b: any) => [b.id, b]));

    // Borrados intencionales de esta pestaña: el id estaba en prevBets y ya
    // no está en bets.
    for (const id of prevById.keys()) {
      if (!nextById.has(id)) merged.delete(id);
    }

    // Altas/ediciones intencionales de esta pestaña: el id es nuevo, o su
    // contenido cambió respecto a prevBets. Un id que esta pestaña traía sin
    // tocar (igual en prevBets y bets) se deja como está en el servidor, para
    // no pisar una edición concurrente de otra pestaña con una copia vieja.
    for (const [id, nextBet] of nextById) {
      const prevBet = prevById.get(id);
      if (!prevBet || JSON.stringify(prevBet) !== JSON.stringify(nextBet)) {
        merged.set(id, nextBet);
      }
    }

    tx.set(dateDocRef, { bets: Array.from(merged.values()) }, { merge: true });
  });
};
