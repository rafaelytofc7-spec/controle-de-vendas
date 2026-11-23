import type { Venda } from "./types";

export const JANELA_DUPLICATA_MS = 5_000;

export interface GrupoDuplicatas {
  valor: number;
  autor: string;
  vendas: Venda[];
}

function chaveAutor(v: Venda): string {
  return v.criadoPorEmail || v.criadoPor || "local";
}

function instante(v: Venda): number {
  const t = Date.parse(v.criado_em);
  return Number.isFinite(t) ? t : 0;
}

/** Groups of 2+ sales with the same amount and author, each within 5s of the previous one. */
export function gruposDuplicatasSuspeitas(vendas: Venda[], janelaMs = JANELA_DUPLICATA_MS): GrupoDuplicatas[] {
  const ativas = vendas.filter((v) => !v.excluido);
  const porChave = new Map<string, Venda[]>();
  for (const v of ativas) {
    const k = `${v.valor}|${chaveAutor(v)}`;
    const arr = porChave.get(k);
    if (arr) arr.push(v);
    else porChave.set(k, [v]);
  }
  const grupos: GrupoDuplicatas[] = [];
  for (const lista of porChave.values()) {
    if (lista.length < 2) continue;
    lista.sort((a, b) => instante(a) - instante(b));
    let atual: Venda[] = [lista[0]];
    for (let i = 1; i < lista.length; i++) {
      const prev = atual[atual.length - 1];
      if (instante(lista[i]) - instante(prev) <= janelaMs) {
        atual.push(lista[i]);
      } else {
        if (atual.length >= 2) grupos.push({ valor: atual[0].valor, autor: chaveAutor(atual[0]), vendas: atual });
        atual = [lista[i]];
      }
    }
    if (atual.length >= 2) grupos.push({ valor: atual[0].valor, autor: chaveAutor(atual[0]), vendas: atual });
  }
  grupos.sort((a, b) => instante(b.vendas[0]) - instante(a.vendas[0]));
  return grupos;
}
