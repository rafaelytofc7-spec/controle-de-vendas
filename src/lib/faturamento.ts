import { somarValores, ticketMedio } from "./dinheiro";
import { chaveMes, chaveSemana, mesmoDia, zonedParts } from "./datas";
import type { Venda } from "./types";

export interface ResumoPeriodo {
  quantidade: number;
  total: number;
  ticketMedio: number;
}

export function filtrarVendas(vendas: Venda[], pred: (v: Venda) => boolean): Venda[] {
  return vendas.filter((v) => !v.excluido && pred(v));
}

export function resumo(vendas: Venda[]): ResumoPeriodo {
  const vals = vendas.map((v) => v.valor);
  return {
    quantidade: vendas.length,
    total: somarValores(vals),
    ticketMedio: ticketMedio(vals),
  };
}

export function resumoDia(vendas: Venda[], chaveDia: string): ResumoPeriodo {
  return resumo(filtrarVendas(vendas, (v) => mesmoDia(v.criado_em, chaveDia)));
}

export function resumoSemana(vendas: Venda[], chave: string): ResumoPeriodo {
  return resumo(filtrarVendas(vendas, (v) => chaveSemana(v.criado_em) === chave));
}

export function resumoMes(vendas: Venda[], ym: string): ResumoPeriodo {
  return resumo(filtrarVendas(vendas, (v) => chaveMes(v.criado_em) === ym));
}

export function resumoTotal(vendas: Venda[]): ResumoPeriodo {
  return resumo(filtrarVendas(vendas, () => true));
}

export function totaisPorDia(vendas: Venda[]): Map<string, number> {
  const m = new Map<string, number[]>();
  for (const v of filtrarVendas(vendas, () => true)) {
    const k = zonedParts(v.criado_em).chaveDia;
    const arr = m.get(k) ?? [];
    arr.push(v.valor);
    m.set(k, arr);
  }
  const out = new Map<string, number>();
  for (const [k, vals] of m) out.set(k, somarValores(vals));
  return out;
}
