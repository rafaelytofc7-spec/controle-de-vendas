import { describe, expect, it } from "vitest";
import { precoAtual, promoAgendada, promoAtiva } from "../../src/lib/preco";
import { calcularReabastecimento } from "../../src/lib/reabastecimento";
import type { Produto } from "../../src/lib/types";

function prod(over: Partial<Produto> = {}): Produto {
  return {
    id: "1", loja: "loja", nome: "Alface", preco: 5, unidade: "un", ordem: 1,
    criado_em: "2026-01-01T00:00:00.000Z", atualizado_em: "2026-01-01T00:00:00.000Z",
    criadoPor: "importado", atualizadoPor: "importado",
    preco_promocional: 3, promo_inicia_em: "2026-06-01T00:00:00.000Z", promo_expira_em: "2026-06-10T00:00:00.000Z",
    ...over,
  };
}

describe("promoções", () => {
  const durante = new Date("2026-06-05T12:00:00.000Z").getTime();
  const antes = new Date("2026-05-01T12:00:00.000Z").getTime();
  const depois = new Date("2026-06-11T12:00:00.000Z").getTime();

  it("precoAtual só usa a promo quando já começou e não venceu", () => {
    expect(promoAtiva(prod(), durante)).toBe(true);
    expect(precoAtual(prod(), durante)).toBe(3);
    expect(promoAgendada(prod(), antes)).toBe(true);
    expect(precoAtual(prod(), antes)).toBe(5);
    expect(promoAtiva(prod(), depois)).toBe(false);
    expect(precoAtual(prod(), depois)).toBe(5);
  });

  it("promo sem data de início vale até expirar", () => {
    const p = prod({ promo_inicia_em: null });
    expect(promoAtiva(p, durante)).toBe(true);
    expect(promoAgendada(p, antes)).toBe(false);
    expect(precoAtual(p, antes)).toBe(3);
  });
});

describe("reabastecimento", () => {
  it("calcula custo e preço sugerido com 2 casas", () => {
    // 10 / 3 = 3.333... -> 3.33; 3.33 * 1.4 = 4.662 -> 4.66
    expect(calcularReabastecimento(10, 3, 40)).toEqual({ custo_unitario: 3.33, preco_sugerido: 4.66 });
    expect(calcularReabastecimento(40, 5, 50)).toEqual({ custo_unitario: 8, preco_sugerido: 12 });
    expect(calcularReabastecimento(10, 0, 40)).toEqual({ custo_unitario: 0, preco_sugerido: 0 });
  });
});
