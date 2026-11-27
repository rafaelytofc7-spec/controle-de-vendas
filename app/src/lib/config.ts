import { ehNativo } from "./plataforma";

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || "https://zmsertdphnhaontkojqa.supabase.co";
/** Chave publicável (sb_publishable_…): pública por natureza, vem do ambiente de build. */
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const LOJA: string = import.meta.env.VITE_LOJA_ID || "ensaio";
/** Só existe no APK (entra sozinho como Caixa). O site do PC nunca tem esse código. */
export const CODIGO_ENTRADA: string = import.meta.env.VITE_CODIGO_ENTRADA || "";
export const NOME_LOJA: string = import.meta.env.VITE_NOME_LOJA_PADRAO || "Minha loja";
export const VERSAO_CODE = 30003;
export const VERSAO_NOME = "3.0.0-teste.3";
export const PLATAFORMA: "android" | "web" = ehNativo() ? "android" : "web";
export const EH_TESTE = LOJA !== "principal";
