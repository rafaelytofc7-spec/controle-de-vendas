/** Public default is generic. The APK build may inject a store name via VITE_NOME_LOJA_PADRAO. */
export const NOME_LOJA_PADRAO = (import.meta.env.VITE_NOME_LOJA_PADRAO as string | undefined)?.trim() || "Minha loja";
