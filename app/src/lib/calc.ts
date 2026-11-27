import { r2 } from "./util";

export type Arredondamento = "nenhum" | "49_99" | "x9";
export type ModoMargem = "venda" | "markup";

/** Custo por unidade útil da compra: (valor + frete) ÷ (quantidade × (1 − perda)). */
export function custoEfetivo(valorPago: number, quantidade: number, perdaPct = 0, frete = 0): number | null {
  if (!(quantidade > 0) || !(valorPago > 0)) return null;
  const util = quantidade * (1 - perdaPct / 100);
  if (!(util > 0)) return null;
  return (valorPago + frete) / util;
}

/** Custo médio ponderado depois de uma entrada. Estoque negativo conta como zero. */
export function custoMedioNovo(estoque: number, custoMedio: number | null, quantidadeUtil: number, custoNovo: number | null): number | null {
  if (custoNovo == null) return custoMedio;
  const e = Math.max(estoque, 0);
  if (custoMedio == null || e === 0) return custoNovo;
  return (e * custoMedio + quantidadeUtil * custoNovo) / (e + quantidadeUtil);
}

export function arredondar(v: number, modo: Arredondamento = "49_99"): number {
  if (!isFinite(v)) return v;
  if (modo === "nenhum") return r2(v);
  if (modo === "x9") return r2(Math.ceil(r2(v) * 10) / 10 - 0.01);
  const v2 = r2(v);
  const inteiro = Math.floor(v2);
  const r = v2 <= inteiro + 0.49 ? inteiro + 0.49 : inteiro + 0.99;
  return r2(Math.max(r, 0.49));
}

/** Preço bruto (sem arredondar) para a margem desejada (%). */
export function precoParaMargem(custo: number, margemPct: number, modo: ModoMargem = "venda"): number {
  if (modo === "markup") return custo * (1 + margemPct / 100);
  const m = Math.min(margemPct, 95) / 100;
  return custo / (1 - m);
}

export function precoSugerido(custo: number | null, margemPct: number, arred: Arredondamento = "49_99", modo: ModoMargem = "venda"): number | null {
  if (custo == null || !(custo > 0)) return null;
  return arredondar(precoParaMargem(custo, margemPct, modo), arred);
}

/** Margem sobre a venda (%) ou markup (%) de um preço. */
export function margemDe(preco: number, custo: number | null, modo: ModoMargem = "venda"): number | null {
  if (custo == null || !(preco > 0) || !(custo > 0)) return null;
  return modo === "markup" ? ((preco - custo) / custo) * 100 : ((preco - custo) / preco) * 100;
}

/** Código de balança (EAN-13 começando com 2): 2 + PLU(5) + valor(5) + DV. */
export function lerCodigoBalanca(codigo: string): { prefixo: string; valor: number } | null {
  if (!/^2\d{12}$/.test(codigo)) return null;
  return { prefixo: codigo.slice(0, 7), valor: Number(codigo.slice(7, 12)) };
}
