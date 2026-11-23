import { describe, expect, it } from "vitest";
import {
  codigoBarrasEmUso,
  encontrarProdutoPorCodigo,
  interpretarLeituraVenda,
  normalizarCodigoBarras,
  podeAdicionarCodigo,
  produtoVendidoPorPeso,
} from "../../src/lib/codigoBarras";
import type { Produto } from "../../src/lib/types";

function prod(p: Partial<Produto> & Pick<Produto, "id" | "nome">): Produto {
  return {
    loja: "principal",
    preco: 3,
    unidade: "un",
    ordem: 1,
    criado_em: "2026-11-22T12:00:00.000-03:00",
    atualizado_em: "2026-11-22T12:00:00.000-03:00",
    preco_promocional: null,
    promo_expira_em: null,
    promo_inicia_em: null,
    criadoPor: "u1",
    atualizadoPor: "u1",
    ...p,
  };
}

describe("código de barras", () => {
  it("normaliza espaços e minúsculas", () => {
    expect(normalizarCodigoBarras(" 789123  ")).toBe("789123");
    expect(normalizarCodigoBarras("abc-01")).toBe("ABC-01");
  });

  it("reconhece produtos vendidos por quilo", () => {
    expect(produtoVendidoPorPeso("kg")).toBe(true);
    expect(produtoVendidoPorPeso("Kg")).toBe(true);
    expect(produtoVendidoPorPeso("quilos")).toBe(true);
    expect(produtoVendidoPorPeso("un")).toBe(false);
    expect(produtoVendidoPorPeso("bandeja")).toBe(false);
    expect(produtoVendidoPorPeso(null)).toBe(false);
  });

  it("encontra o produto pelo código e soma unidades na venda", () => {
    const produtos = [
      prod({ id: "a", nome: "Suco", preco: 5, codigos_barras: ["7891"] }),
      prod({ id: "b", nome: "Alface", preco: 4, unidade: "kg", codigos_barras: ["7892"] }),
    ];
    expect(encontrarProdutoPorCodigo(produtos, "7891")?.nome).toBe("Suco");
    const ok = interpretarLeituraVenda(produtos, "7891");
    expect(ok).toEqual({ tipo: "ok", produto: produtos[0], preco: 5, codigo: "7891" });
    const kg = interpretarLeituraVenda(produtos, "7892");
    expect(kg.tipo).toBe("por_kg");
    expect(interpretarLeituraVenda(produtos, "0000").tipo).toBe("desconhecido");
  });

  it("bloqueia código repetido no mesmo produto ou em outro", () => {
    const produtos = [
      prod({ id: "a", nome: "Suco", codigos_barras: ["111"] }),
      prod({ id: "b", nome: "Biscoito", codigos_barras: ["222"] }),
    ];
    expect(podeAdicionarCodigo(produtos, produtos[0], "111").ok).toBe(false);
    expect(podeAdicionarCodigo(produtos, produtos[0], "222")).toMatchObject({ ok: false, motivo: "duplicado_outro" });
    expect(podeAdicionarCodigo(produtos, produtos[0], "333")).toEqual({ ok: true, codigo: "333" });
    expect(codigoBarrasEmUso(produtos, "222", "b")).toBeUndefined();
    expect(podeAdicionarCodigo(produtos, { id: "c", unidade: "kg", codigos_barras: [] }, "444")).toMatchObject({ ok: false, motivo: "por_kg" });
  });
});
