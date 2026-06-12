import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';

const getProcessEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;

const firebaseConfig = {
  apiKey: getProcessEnv('FIREBASE_API_KEY') || (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: getProcessEnv('FIREBASE_AUTH_DOMAIN') || (import.meta.env && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: getProcessEnv('FIREBASE_PROJECT_ID') || (import.meta.env && import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: getProcessEnv('FIREBASE_STORAGE_BUCKET') || (import.meta.env && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: getProcessEnv('FIREBASE_MESSAGING_SENDER_ID') || (import.meta.env && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: getProcessEnv('FIREBASE_APP_ID') || (import.meta.env && import.meta.env.VITE_FIREBASE_APP_ID),
};

const hasFirebaseConfig = !!firebaseConfig.projectId;

const app = hasFirebaseConfig
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null;

export const db = app
  ? (() => {
      try {
        return initializeFirestore(app, { 
          ignoreUndefinedProperties: true, 
          experimentalForceLongPolling: true 
        });
      } catch (e) {
        return getFirestore(app);
      }
    })()
  : null;
