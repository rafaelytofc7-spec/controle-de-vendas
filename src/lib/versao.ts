export const APP_VERSION = "1.7.2";
export const VERSION_URL = "https://rafaelytofc7-spec.github.io/controle-de-vendas/version.json";
export const APK_RELEASE_URL = "https://github.com/rafaelytofc7-spec/controle-de-vendas/releases/latest";

export interface InfoVersao {
  version: string;
  apkUrl?: string;
}

export function temAtualizacao(atual: string, remota: string): boolean {
  const a = atual.split(".").map((n) => Number(n) || 0);
  const b = remota.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

export async function buscarVersaoRemota(sinal?: AbortSignal): Promise<InfoVersao | null> {
  try {
    const r = await fetch(VERSION_URL, { cache: "no-store", signal: sinal });
    if (!r.ok) return null;
    const j = await r.json() as InfoVersao;
    if (!j || typeof j.version !== "string") return null;
    return j;
  } catch {
    return null;
  }
}
