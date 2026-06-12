import { db } from '../config/firebase';
import { collection, doc, setDoc, getDocs, getDoc, query, where, onSnapshot } from 'firebase/firestore';

const BETS_COLLECTION = 'mlb_bets';
const USERS_DOC = 'mlb_users/registered';

export const syncUsers = (callback: (users: string[]) => void) => {
  if (!db) return () => {};
  const usersRef = doc(db, USERS_DOC);
  return onSnapshot(usersRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      callback(data.list || []);
    } else {
      callback([]);
    }
  });
};

export const registerUserDb = async (name: string) => {
  if (!db || !name.trim()) return;
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
  const dateDocRef = doc(db, BETS_COLLECTION, date);
  return onSnapshot(dateDocRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().bets || []);
    } else {
      callback([]);
    }
  });
};

export const saveBetsDb = async (date: string, bets: any[]) => {
  if (!db) return;
  const dateDocRef = doc(db, BETS_COLLECTION, date);
  await setDoc(dateDocRef, { bets }, { merge: true });
};
