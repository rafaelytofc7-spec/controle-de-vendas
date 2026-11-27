/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_LOJA_ID?: string;
  readonly VITE_CODIGO_ENTRADA?: string;
  readonly VITE_NOME_LOJA_PADRAO?: string;
}
