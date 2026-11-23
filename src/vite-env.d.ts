/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_EMULATOR?: string;
  readonly VITE_FIRESTORE_EMULATOR_PORT?: string;
  readonly VITE_AUTH_EMULATOR_PORT?: string;
  readonly VITE_NOME_LOJA_PADRAO?: string;
  readonly VITE_LOJA_NUVEM_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
