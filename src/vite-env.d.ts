/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_EMULATOR?: string;
  readonly VITE_FIRESTORE_EMULATOR_PORT?: string;
  readonly VITE_AUTH_EMULATOR_PORT?: string;
  readonly VITE_NOME_LOJA_PADRAO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
