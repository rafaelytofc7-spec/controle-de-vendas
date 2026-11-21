/** Money helpers using integer cents to avoid float drift. */

const CENT = 100n;

export function paraCentavos(valor: number | string): bigint {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return 0n;
    const sinal = valor < 0 ? -1n : 1n;
    return sinal * BigInt(Math.round(Math.abs(valor) * 100));
  }
  const t = valor.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!t || t === "-" || t === ".") return 0n;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0n;
  return paraCentavos(n);
}

export function deCentavos(centavos: bigint): number {
  const sinal = centavos < 0n ? -1 : 1;
  const abs = centavos < 0n ? -centavos : centavos;
  return sinal * Number(abs) / 100;
}

export function arredondar2(valor: number): number {
  return deCentavos(paraCentavos(valor));
}

export function somarValores(valores: Iterable<number>): number {
  let acc = 0n;
  for (const v of valores) acc += paraCentavos(v);
  return deCentavos(acc);
}

export function ticketMedio(valores: Iterable<number>): number {
  let acc = 0n;
  let n = 0;
  for (const v of valores) {
    acc += paraCentavos(v);
    n += 1;
  }
  if (n === 0) return 0;
  // average of the sum, then round to 2 decimals
  const media = Number(acc) / (n * 100);
  return arredondar2(media);
}

export function formatarReais(valor: number): string {
  return deCentavos(paraCentavos(valor)).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Calculator typed as cents: digits "100" means R$ 1,00. */
export function digitsParaValor(digits: string): number {
  const limpo = digits.replace(/\D/g, "");
  if (!limpo) return 0;
  return deCentavos(BigInt(limpo));
}

export function valorParaDigits(valor: number): string {
  const c = paraCentavos(valor);
  if (c <= 0n) return "";
  return c.toString();
}

export function apagarUltimoDigito(digits: string): string {
  return digits.replace(/\D/g, "").slice(0, -1);
}

export function acrescentarDigito(digits: string, d: string): string {
  if (!/^\d$/.test(d)) return digits;
  const atual = digits.replace(/\D/g, "");
  if (atual.length >= 9) return atual;
  const next = (atual + d).replace(/^0+(?=\d)/, "");
  return next;
}

export type Operador = "+" | "-" | "*" | "/";

export function calcular(a: number, b: number, op: Operador): number {
  if (op === "+") return deCentavos(paraCentavos(a) + paraCentavos(b));
  if (op === "-") return deCentavos(paraCentavos(a) - paraCentavos(b));
  if (op === "*") return arredondar2(a * b);
  if (op === "/") {
    if (b === 0) return a;
    return arredondar2(a / b);
  }
  return b;
}

export function troco(valor: number, recebido: number): number {
  return deCentavos(paraCentavos(recebido) - paraCentavos(valor));
}

export const HISTORICO_EXPIRA_MS = 5 * 60 * 1000;

export function historicoVigente<T extends { em: number }>(
  itens: T[],
  agora = Date.now(),
  limite = HISTORICO_EXPIRA_MS,
): T[] {
  return itens.filter((i) => agora - i.em < limite);
}
