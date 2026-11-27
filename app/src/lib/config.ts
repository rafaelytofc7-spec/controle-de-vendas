import { ehNativo } from "./plataforma";

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || "https://zmsertdphnhaontkojqa.supabase.co";
/** Chave publicável (sb_publishable_…): pública por natureza, vem do ambiente de build. */
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const LOJA: string = import.meta.env.VITE_LOJA_ID || "ensaio";
/** Opcional (desligado por padrão): o APK entra sozinho como Caixa pelo servidor (caixa_automatico). */
export const CODIGO_ENTRADA: string = import.meta.env.VITE_CODIGO_ENTRADA || "";
export const NOME_LOJA: string = import.meta.env.VITE_NOME_LOJA_PADRAO || "Minha loja";
export const VERSAO_CODE = 30005;
export const VERSAO_NOME = "3.0.0-teste.5";
// (só nos testes automáticos o navegador pode se passar por APK; no build normal isso some)
export const PLATAFORMA: "android" | "web" =
  ehNativo() || (import.meta.env.VITE_E2E === "1" && import.meta.env.VITE_E2E_ANDROID === "1") ? "android" : "web";
export const EH_TESTE = LOJA !== "principal";
