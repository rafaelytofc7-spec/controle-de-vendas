import { arredondar, custoEfetivo, custoMedioNovo, lerCodigoBalanca, margemDe, precoParaMargem, precoSugerido } from "../../src/lib/calc";
import { lerNumero, diaSP } from "../../src/lib/util";
import { acharPorCodigo, buscar } from "../../src/lib/produtos";

describe("calc", () => {
  it("custo efetivo com perda e frete", () => {
    expect(custoEfetivo(100, 20)).toBe(5);
    expect(custoEfetivo(100, 20, 8, 4)!).toBeCloseTo(104 / 18.4, 10);
    expect(custoEfetivo(0, 20)).toBeNull();
    expect(custoEfetivo(10, 0)).toBeNull();
  });
  it("custo médio ponderado", () => {
    expect(custoMedioNovo(18.4, 5.2, 18.4, 5.65)!).toBeCloseTo(5.425, 3);
    expect(custoMedioNovo(0, 5.2, 10, 6)).toBe(6);
    expect(custoMedioNovo(-3, 5.2, 10, 6)).toBe(6);
    expect(custoMedioNovo(10, null, 10, 6)).toBe(6);
    expect(custoMedioNovo(10, 5, 10, null)).toBe(5);
  });
  it("arredonda para ,49/,99", () => {
    expect(arredondar(9.27)).toBe(9.49);
    expect(arredondar(9.49)).toBe(9.49);
    expect(arredondar(9.5)).toBe(9.99);
    expect(arredondar(9.0)).toBe(9.49);
    expect(arredondar(0.1)).toBe(0.49);
    expect(arredondar(9.27, "x9")).toBe(9.29);
    expect(arredondar(9.271, "nenhum")).toBe(9.27);
  });
  it("preço para margem sobre a venda e markup", () => {
    expect(precoParaMargem(5.56, 40)).toBeCloseTo(9.2667, 3);
    expect(precoParaMargem(5, 35, "markup")).toBeCloseTo(6.75, 6);
    expect(precoSugerido(5.56, 35)).toBe(8.99);
    expect(precoSugerido(null, 35)).toBeNull();
    expect(margemDe(10, 6)).toBeCloseTo(40, 6);
    expect(margemDe(10, 6, "markup")).toBeCloseTo(66.666, 2);
  });
  it("código de balança", () => {
    expect(lerCodigoBalanca("2000123012345")).toEqual({ prefixo: "2000123", valor: 1234 });
    expect(lerCodigoBalanca("7891234567890")).toBeNull();
  });
  it("lê números em pt-BR", () => {
    expect(lerNumero("1.234,56")).toBe(1234.56);
    expect(lerNumero("12,5")).toBe(12.5);
    expect(lerNumero("20")).toBe(20);
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
  });
  it("dia em São Paulo", () => {
    expect(diaSP("2026-11-27T02:30:00Z")).toBe("2026-11-26");
    expect(diaSP("2026-11-27T03:30:00Z")).toBe("2026-11-27");
  });
});

describe("produtos", () => {
  const base = { loja_id: "t", categoria: null, preco_promocional: null, promo_inicia_em: null, promo_expira_em: null, margem_desejada: null, base_custo: "medio" as const,
    perda_padrao: 0, estoque_minimo: null, validade_dias: null, fornecedor_id: null, ativo: true, ordem: 0, excluido: false, criado_em: "", atualizado_em: "" };
  const produtos = {
    a: { ...base, id: "a", nome: "Tomate Italiano", unidade: "kg" as const, preco: 8.99 },
    b: { ...base, id: "b", nome: "Leite integral", unidade: "un" as const, preco: 5.47 },
  };
  const codigos = { "7890000000012": { loja_id: "t", codigo: "7890000000012", produto_id: "b" }, "2000123": { loja_id: "t", codigo: "2000123", produto_id: "a" } };
  it("acha por código exato e por etiqueta de balança", () => {
    expect(acharPorCodigo("7890000000012", produtos, codigos)?.produto.id).toBe("b");
    const r = acharPorCodigo("2000123011240", produtos, codigos)!; // R$ 11,24
    expect(r.produto.id).toBe("a"); expect(r.total).toBe(11.24); expect(r.quantidade).toBeCloseTo(1.25, 2);
    const p = acharPorCodigo("2000123012500", produtos, codigos, "peso")!; // 1,250 kg
    expect(p.quantidade).toBe(1.25); expect(p.total).toBe(11.24);
    expect(acharPorCodigo("123", produtos, codigos)).toBeNull();
  });
  it("busca sem acento e por código", () => {
    expect(buscar(Object.values(produtos), codigos, "tomáte").map((p) => p.id)).toEqual(["a"]);
    expect(buscar(Object.values(produtos), codigos, "00000012").map((p) => p.id)).toEqual(["b"]);
  });
});
