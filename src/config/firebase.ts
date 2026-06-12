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
  apiKey: getProcessEnv('FIREBASE_API_KEY') || (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) || "AIzaSyABTa7InfS8xP9PAVACYxzk9kktbGVcFvg",
  authDomain: getProcessEnv('FIREBASE_AUTH_DOMAIN') || (import.meta.env && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || "studio-207019270-ff455.firebaseapp.com",
  projectId: getProcessEnv('FIREBASE_PROJECT_ID') || (import.meta.env && import.meta.env.VITE_FIREBASE_PROJECT_ID) || "studio-207019270-ff455",
  storageBucket: getProcessEnv('FIREBASE_STORAGE_BUCKET') || (import.meta.env && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || "studio-207019270-ff455.firebasestorage.app",
  messagingSenderId: getProcessEnv('FIREBASE_MESSAGING_SENDER_ID') || (import.meta.env && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || "1013252985995",
  appId: getProcessEnv('FIREBASE_APP_ID') || (import.meta.env && import.meta.env.VITE_FIREBASE_APP_ID) || "1:1013252985995:web:9eef813ce94382d7c4b08e",
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
