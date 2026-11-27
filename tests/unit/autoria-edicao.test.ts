import { describe, expect, it } from "vitest";
import { autoriaAtualizacao, autoriaNova } from "../../src/lib/autoria";

const user = { uid: "u2", displayName: "Caixa", email: null };

describe("autoria não pode apagar campos editados", () => {
  it("ao mesclar, os campos novos ficam por cima da linha existente", () => {
    const atual = {
      id: "p1",
      nome: "Tomate teste",
      preco: 3.5,
      unidade: "un",
      ...autoriaNova({ uid: "u1", displayName: "Caixa", email: null }),
    };
    const p = { id: "p1", nome: "Tomate teste", preco: 4, unidade: "un" };
    const aut = autoriaAtualizacao(atual, user);
    const row = { ...aut, ...p, atualizado_em: "agora" };
    expect(row.preco).toBe(4);
    expect(row.atualizadoPor).toBe("u2");
    expect(row.criadoPor).toBe("u1");
  });
});
