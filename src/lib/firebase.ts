import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import type { FirebaseWebConfig } from "./types";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let dbFs: Firestore | null = null;
let lastKey = "";

export function configValida(cfg: FirebaseWebConfig | undefined | null): cfg is FirebaseWebConfig {
  if (!cfg) return false;
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
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
  dbFs = getFirestore(app);
  lastKey = key;
  return { app, auth, db: dbFs };
}

export function firebaseAtivo(): boolean {
  return Boolean(app && auth && dbFs);
}

export function getFirebase() {
  if (!app || !auth || !dbFs) throw new Error("Firebase ainda não foi configurado.");
  return { app, auth, db: dbFs };
}
