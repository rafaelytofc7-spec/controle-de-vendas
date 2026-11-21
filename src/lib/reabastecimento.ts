import { arredondar2 } from "./dinheiro";

export function custoUnitario(valorTotal: number, quantidade: number): number {
  if (quantidade <= 0) return 0;
  return arredondar2(valorTotal / quantidade);
}

export function precoSugerido(valorTotal: number, quantidade: number, margem: number): number {
  const custo = custoUnitario(valorTotal, quantidade);
  return arredondar2(custo * (1 + margem / 100));
}

export function calcularReabastecimento(valorTotal: number, quantidade: number, margem: number) {
  const custo_unitario = custoUnitario(valorTotal, quantidade);
  const preco_sugerido = precoSugerido(valorTotal, quantidade, margem);
  return { custo_unitario, preco_sugerido };
}
