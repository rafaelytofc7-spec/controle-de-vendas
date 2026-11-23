import { describe, expect, it } from "vitest";
import { JANELA_ONLINE_MS, membroOnline, nomeDeRegistro, rotuloPapel, totaisPorPessoa } from "../../src/lib/presenca";
import type { MembroLoja, Venda } from "../../src/lib/types";

const membros: MembroLoja[] = [
  { uid: "u1", nome: "Rafael", papel: "lider", bloqueado: false, ultimoAcesso: "2026-11-22T21:00:00.000-03:00", criado_em: "2026-11-22T10:00:00.000-03:00" },
  { uid: "u2", nome: "Ana", papel: "membro", bloqueado: false, ultimoAcesso: "2026-11-22T20:00:00.000-03:00", criado_em: "2026-11-22T10:00:00.000-03:00" },
];

function venda(partial: Partial<Venda> & Pick<Venda, "id" | "valor" | "criadoPor">): Venda {
  return {
    loja: "principal",
    criado_em: "2026-11-22T12:00:00.000-03:00",
    atualizado_em: "2026-11-22T12:00:00.000-03:00",
    atualizadoPor: partial.criadoPor,
    ...partial,
  };
}

describe("presença e autoria", () => {
  it("considera online quem foi visto na janela de 2 minutos", () => {
    const agora = Date.parse("2026-11-22T21:01:00.000-03:00");
    expect(membroOnline(membros[0], agora)).toBe(true);
    expect(membroOnline(membros[1], agora)).toBe(false);
    expect(membroOnline({ ultimoAcesso: null }, agora)).toBe(false);
    expect(JANELA_ONLINE_MS).toBe(120_000);
    const limite = Date.parse("2026-11-22T21:02:00.000-03:00");
    expect(membroOnline(membros[0], limite)).toBe(true);
    expect(membroOnline(membros[0], limite + 1)).toBe(false);
  });

  it("mostra o nome de quem registrou, ou importado no histórico antigo", () => {
    expect(nomeDeRegistro({ criadoPor: "u1", criadoPorEmail: "rafael@x" }, membros)).toBe("Rafael");
    expect(nomeDeRegistro({ criadoPor: "u2" }, membros)).toBe("Ana");
    expect(nomeDeRegistro({ criadoPor: "importado" }, membros)).toBe("Importado");
    expect(nomeDeRegistro({ criadoPor: "" }, membros)).toBe("Importado");
    expect(nomeDeRegistro({ criadoPor: "local" }, membros)).toBe("Neste aparelho");
  });

  it("rotula o papel lider como Admin na interface", () => {
    expect(rotuloPapel("lider")).toBe("Admin");
    expect(rotuloPapel("membro", true)).toBe("Admin");
    expect(rotuloPapel("membro")).toBe("Equipe");
  });

  it("soma totais por pessoa no dia ou no mês", () => {
    const itens = [
      venda({ id: "a", valor: 10, criadoPor: "u1" }),
      venda({ id: "b", valor: 5.5, criadoPor: "u1" }),
      venda({ id: "c", valor: 20, criadoPor: "u2" }),
      venda({ id: "d", valor: 3, criadoPor: "importado" }),
      venda({ id: "e", valor: 99, criadoPor: "u2", excluido: true }),
    ];
    const totais = totaisPorPessoa(itens, membros);
    expect(totais.map((t) => [t.chave, t.nome, t.quantidade, t.total])).toEqual([
      ["u2", "Ana", 1, 20],
      ["u1", "Rafael", 2, 15.5],
      ["importado", "Importado", 1, 3],
    ]);
  });
});
