import { describe, expect, it } from "vitest";
import { gruposDuplicatasSuspeitas, JANELA_DUPLICATA_MS } from "../../src/lib/duplicatas";
import type { Venda } from "../../src/lib/types";

function v(id: string, valor: number, criado_em: string, autor = "u1", email = "Ana"): Venda {
  return {
    id, loja: "loja", valor, criado_em, atualizado_em: criado_em,
    criadoPor: autor, criadoPorEmail: email, atualizadoPor: autor, atualizadoPorEmail: email,
  };
}

describe("gruposDuplicatasSuspeitas", () => {
  it("agrupa o mesmo valor e autor em até 5 segundos", () => {
    const base = "2026-11-23T11:00:00.000-03:00";
    const t2 = "2026-11-23T11:00:03.000-03:00";
    const grupos = gruposDuplicatasSuspeitas([
      v("a", 10, base),
      v("b", 10, t2),
      v("c", 20, base),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].valor).toBe(10);
    expect(grupos[0].vendas.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("não agrupa se o intervalo passa da janela", () => {
    const base = Date.parse("2026-11-23T11:00:00.000-03:00");
    const t2 = new Date(base + JANELA_DUPLICATA_MS + 1).toISOString();
    const grupos = gruposDuplicatasSuspeitas([
      v("a", 10, "2026-11-23T11:00:00.000-03:00"),
      v("b", 10, t2),
    ]);
    expect(grupos).toHaveLength(0);
  });

  it("não agrupa autores diferentes", () => {
    const base = "2026-11-23T11:00:00.000-03:00";
    const grupos = gruposDuplicatasSuspeitas([
      v("a", 10, base, "u1", "Ana"),
      v("b", 10, base, "u2", "Bia"),
    ]);
    expect(grupos).toHaveLength(0);
  });
});
