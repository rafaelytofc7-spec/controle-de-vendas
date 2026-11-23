export type EstadoStatusNuvem = "offline" | "enviando" | "sincronizado";

export function estadoStatusNuvem(opts: { online: boolean; enviando: boolean }): EstadoStatusNuvem {
  if (!opts.online) return "offline";
  if (opts.enviando) return "enviando";
  return "sincronizado";
}

/** Rótulo curto no cabeçalho, no mesmo espírito do primeiro app (online / offline + fila). */
export function rotuloStatusNuvem(opts: { online: boolean; enviando: boolean; vendasAguardando: number }): string {
  const n = Math.max(0, opts.vendasAguardando);
  if (!opts.online) {
    if (n <= 0) return "Offline";
    return n === 1 ? "Offline, 1 venda aguardando" : `Offline, ${n} vendas aguardando`;
  }
  if (opts.enviando || n > 0) return "Enviando...";
  return "Online, sincronizado";
}
