import { db, app } from '../config/firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
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

export const saveBetsDb = async (date: string, bets: any[]) => {
  if (!db) return;
  const isAuthed = await ensureAnonymousAuth();
  if (!isAuthed) return;

  const dateDocRef = doc(db, BETS_COLLECTION, date);
  await setDoc(dateDocRef, { bets }, { merge: true });
};
