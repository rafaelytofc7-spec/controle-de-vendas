import type { SupabaseWebConfig } from "./types";

/** Public URL and anon (publishable) key of the official project. Safe to ship in the PWA and the APK. */
export const SUPABASE_CONFIG_PADRAO: SupabaseWebConfig = {
  url: 'https://zmsertdphnhaontkojqa.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2VydGRwaG5oYW9udGtvanFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MzU1MjgsImV4cCI6MjExMTAxMTUyOH0.LrrV_GxrotKPBqlPkIMZ9buaEhW7YoFOp2jxp708PdA',
};

export function mesmaConfig(a?: SupabaseWebConfig | null, b?: SupabaseWebConfig | null): boolean {
  if (!a || !b) return false;
  return a.url === b.url && a.anonKey === b.anonKey;
}

/** Official store id. Tests may override with VITE_LOJA_NUVEM_ID (never use principal in probes). */
export const LOJA_NUVEM_ID = (import.meta.env.VITE_LOJA_NUVEM_ID as string | undefined)?.trim() || "principal";
