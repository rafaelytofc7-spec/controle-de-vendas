export type EstadoStatusNuvem = "offline" | "enviando" | "sincronizado";

export function estadoStatusNuvem(opts: {
  online: boolean;
  enviando: boolean;
  canalInscrito?: boolean;
  membro?: boolean;
}): EstadoStatusNuvem {
  if (!opts.online) return "offline";
  if (opts.enviando || !opts.canalInscrito || opts.membro === false) return "enviando";
  return "sincronizado";
}

/** Rótulo curto no cabeçalho: sincronizado só com o canal inscrito, membro pronto e a fila vazia. */
export function rotuloStatusNuvem(opts: {
  online: boolean;
  enviando: boolean;
  vendasAguardando: number;
  canalInscrito?: boolean;
  membro?: boolean;
}): string {
  const n = Math.max(0, opts.vendasAguardando);
  if (!opts.online) {
    if (n <= 0) return "Offline";
    return n === 1 ? "Offline, 1 venda aguardando" : `Offline, ${n} vendas aguardando`;
  }
  if (opts.enviando || n > 0 || !opts.canalInscrito || opts.membro === false) return "Enviando...";
  return "Online, sincronizado";
}
