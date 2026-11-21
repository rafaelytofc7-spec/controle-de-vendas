import { somarValores, ticketMedio } from "./dinheiro";
import { chaveSemanaDeParts, zonedParts } from "./datas";
import type { Venda } from "./types";
import type { ResumoPeriodo } from "./faturamento";

export const RESUMO_VAZIO: ResumoPeriodo = { quantidade: 0, total: 0, ticketMedio: 0 };

export interface AgregadosVendas {
  porDia: Map<string, ResumoPeriodo>;
  porSemana: Map<string, ResumoPeriodo>;
  porMes: Map<string, ResumoPeriodo>;
  porDiaLista: Map<string, Venda[]>;
  total: ResumoPeriodo;
}

function fechar(vals: number[]): ResumoPeriodo {
  if (vals.length === 0) return RESUMO_VAZIO;
  return { quantidade: vals.length, total: somarValores(vals), ticketMedio: ticketMedio(vals) };
}

function mapaResumo(origem: Map<string, number[]>): Map<string, ResumoPeriodo> {
  const out = new Map<string, ResumoPeriodo>();
  for (const [k, vals] of origem) out.set(k, fechar(vals));
  return out;
}

/** Single pass over the sales list. Call only when the array changes. */
export function agregarVendas(vendas: Venda[]): AgregadosVendas {
  const porDiaVals = new Map<string, number[]>();
  const porSemanaVals = new Map<string, number[]>();
  const porMesVals = new Map<string, number[]>();
  const porDiaLista = new Map<string, Venda[]>();
  const todos: number[] = [];

  for (const v of vendas) {
    if (v.excluido) continue;
    const p = zonedParts(v.criado_em);
    const semana = chaveSemanaDeParts(p);
    const mes = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const add = (m: Map<string, number[]>, k: string) => {
      const arr = m.get(k);
      if (arr) arr.push(v.valor);
      else m.set(k, [v.valor]);
    };
    add(porDiaVals, p.chaveDia);
    add(porSemanaVals, semana);
    add(porMesVals, mes);
    const lista = porDiaLista.get(p.chaveDia);
    if (lista) lista.push(v);
    else porDiaLista.set(p.chaveDia, [v]);
    todos.push(v.valor);
  }

  for (const lista of porDiaLista.values()) {
    lista.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }

  return {
    porDia: mapaResumo(porDiaVals),
    porSemana: mapaResumo(porSemanaVals),
    porMes: mapaResumo(porMesVals),
    porDiaLista,
    total: fechar(todos),
  };
}

export function resumoOuVazio(m: Map<string, ResumoPeriodo>, chave: string): ResumoPeriodo {
  return m.get(chave) ?? RESUMO_VAZIO;
}
