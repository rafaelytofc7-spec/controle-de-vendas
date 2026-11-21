import { describe, expect, it } from "vitest";
import { normalizarVenda, parseBackup, normalizarBackup } from "../../src/lib/importacao";
import { AUTOR_IMPORTADO } from "../../src/lib/types";
import { rotuloAutor } from "../../src/lib/autoria";
import { temAtualizacao } from "../../src/lib/versao";

describe("autoria de registros importados", () => {
  it("marca como importado quando o backup antigo não tem autor", () => {
    const v = normalizarVenda({ id: "1", valor: 10, criado_em: "2026-01-01T00:00:00.000Z" }, "loja");
    expect(v.criadoPor).toBe(AUTOR_IMPORTADO);
    expect(v.atualizadoPor).toBe(AUTOR_IMPORTADO);
  });

  it("preserva o autor quando o backup já traz criadoPor", () => {
    const v = normalizarVenda({
      id: "2", valor: 5, criado_em: "2026-01-01T00:00:00.000Z",
      criadoPor: "uid-abc", criadoPorEmail: "a@b.com",
      atualizadoPor: "uid-abc", atualizadoPorEmail: "a@b.com",
    }, "loja");
    expect(v.criadoPor).toBe("uid-abc");
    expect(v.criadoPorEmail).toBe("a@b.com");
  });

  it("rotula importado e e-mail", () => {
    expect(rotuloAutor("importado")).toBe("Importado");
    expect(rotuloAutor("uid", "pessoa@loja.com")).toBe("pessoa@loja.com");
  });
});

describe("versão", () => {
  it("detecta versão mais nova", () => {
    expect(temAtualizacao("1.0.0", "1.0.1")).toBe(true);
    expect(temAtualizacao("1.0.0", "1.0.0")).toBe(false);
    expect(temAtualizacao("1.1.0", "1.0.9")).toBe(false);
  });
});

describe("backup oficial importado", () => {
  it("carrega criadoPor importado em um backup mínimo", () => {
    const raw = {
      formato: "controle-de-vendas-backup",
      versao: 1,
      loja: "loja",
      configuracao: { loja: "loja", nome_loja: "X", telefone: "", mensagem_cardapio: "", taxa_entrega: 0, observacoes: "", atualizado_em: "2026-01-01T00:00:00.000Z" },
      vendas: [{ id: "v1", loja: "loja", valor: 1, criado_em: "2026-01-01T00:00:00.000Z", atualizado_em: "2026-01-01T00:00:00.000Z" }],
      produtos: [], entregas: [], encomendas: [], cobrancas: [], reabastecimentos: [],
    };
    const dados = normalizarBackup(parseBackup(raw));
    expect(dados.vendas[0].criadoPor).toBe("importado");
  });
});
