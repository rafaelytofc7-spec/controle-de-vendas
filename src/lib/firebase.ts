import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import type { FirebaseWebConfig } from "./types";
import { FIREBASE_CONFIG_PADRAO } from "./firebasePadrao";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let dbFs: Firestore | null = null;
let lastKey = "";
let emuladorLigado = false;

export function usarEmuladorFirebase(): boolean {
  return import.meta.env.VITE_FIREBASE_EMULATOR === "1";
}

export function configValida(cfg: FirebaseWebConfig | undefined | null): cfg is FirebaseWebConfig {
  if (!cfg) return false;
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

/** Saved override if valid, otherwise the official project shipped with the app. */
export function configEfetiva(salva?: FirebaseWebConfig | null): FirebaseWebConfig {
  return configValida(salva) ? salva : FIREBASE_CONFIG_PADRAO;
}

export function iniciarFirebase(cfg: FirebaseWebConfig): { app: FirebaseApp; auth: Auth; db: Firestore } {
  const key = JSON.stringify({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    appId: cfg.appId,
  });
  if (app && auth && dbFs && lastKey === key) return { app, auth, db: dbFs };
  if (getApps().length && lastKey !== key) {
    // A new config: we cannot reliably re-init; reuse only if same project
  }
  app = getApps().length ? getApps()[0] : initializeApp(cfg);
  auth = getAuth(app);
  try {
    dbFs = initializeFirestore(app, {
      localCache: usarEmuladorFirebase()
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    dbFs = getFirestore(app);
  }
  lastKey = key;
  if (usarEmuladorFirebase() && !emuladorLigado) {
    const authPort = Number(import.meta.env.VITE_AUTH_EMULATOR_PORT) || 9099;
    const fsPort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT) || 8080;
    try { connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true }); } catch { /* já ligado */ }
    try { connectFirestoreEmulator(dbFs, "127.0.0.1", fsPort); } catch { /* já ligado */ }
    emuladorLigado = true;
  }
  return { app, auth, db: dbFs };
}

export function firebaseAtivo(): boolean {
  return Boolean(app && auth && dbFs);
}

export function getFirebase() {
  if (!app || !auth || !dbFs) throw new Error("Firebase ainda não foi configurado.");
  return { app, auth, db: dbFs };
}
