import type { FirebaseWebConfig } from "./types";

/** Public web client identifiers of the official project. Safe to ship in the PWA and the APK. */
export const FIREBASE_CONFIG_PADRAO: FirebaseWebConfig = {
  apiKey: "AIzaSyD4R5rMgm8qFwwfUVDWwxw67mVZFPUyZQM",
  authDomain: "controle-de-vendas-bddb9.firebaseapp.com",
  projectId: "controle-de-vendas-bddb9",
  storageBucket: "controle-de-vendas-bddb9.firebasestorage.app",
  messagingSenderId: "518646201990",
  appId: "1:518646201990:web:b599e75d4d316893d79b07",
};

export function mesmaConfig(a?: FirebaseWebConfig | null, b?: FirebaseWebConfig | null): boolean {
  if (!a || !b) return false;
  return a.apiKey === b.apiKey && a.authDomain === b.authDomain && a.projectId === b.projectId && a.appId === b.appId;
}
