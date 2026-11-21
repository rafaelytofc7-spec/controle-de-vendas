import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ESPERADO_BACKUP_INICIAL, montarBackup, normalizarBackup, parseBackup, verificarBackupOficial,
} from "../../src/lib/importacao";
import { somarValores, arredondar2 } from "../../src/lib/dinheiro";

const OFICIAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json");

describe("importação de um backup pequeno", () => {
  it("normaliza campos e ignora tokens", () => {
    const raw = {
      formato: "controle-de-vendas-backup",
      versao: 1,
      loja: "loja-teste",
      configuracao: { nomeLoja: "Loja Teste", taxaEntrega: 2.5, token: "NAO-DEVE-APARECER" },
      vendas: [{ id: "v1", valor: "10,50", criado_em: "2026-01-02T15:00:00.000Z" }],
      produtos: [{ id: "p1", nome: "Couve", preco: 4.9, unidade: "un", ordem: 1 }],
      encomendas: [{ id: "e1", cliente: "Ana", produto: "Couve", valor: 4.9, pago: true }],
      cobrancas: [{ id: "c1", valor: 4.9, provedor: "stone", forma: "pix", status: "cancelada", modoTeste: true, token: "segredo" }],
    };
    const dados = normalizarBackup(parseBackup(raw));
    expect(dados.loja).toBe("loja-teste");
    expect(dados.configuracao.nome_loja).toBe("Loja Teste");
    expect(dados.configuracao.taxa_entrega).toBe(2.5);
    expect(JSON.stringify(dados)).not.toContain("NAO-DEVE-APARECER");
    expect(JSON.stringify(dados)).not.toContain("segredo");
    expect(dados.vendas[0].valor).toBe(10.5);
    expect(dados.cobrancas[0].modo_teste).toBe(true);
    const out = montarBackup(dados);
    expect(out.verificacao?.total_vendas).toBe(10.5);
  });
});

describe.skipIf(!existsSync(OFICIAL))("backup oficial da loja", () => {
  it("importa 6916 vendas, 57 produtos, 5 encomendas, 3 cobranças e total 164476.16", () => {
    const raw = JSON.parse(readFileSync(OFICIAL, "utf-8"));
    const dados = normalizarBackup(parseBackup(raw));
    const v = verificarBackupOficial(dados);
    expect(v.vendas).toBe(ESPERADO_BACKUP_INICIAL.vendas);
    expect(v.produtos).toBe(ESPERADO_BACKUP_INICIAL.produtos);
    expect(v.encomendas).toBe(ESPERADO_BACKUP_INICIAL.encomendas);
    expect(v.cobrancas).toBe(ESPERADO_BACKUP_INICIAL.cobrancas);
    expect(v.total_vendas).toBe(ESPERADO_BACKUP_INICIAL.total_vendas);
    expect(arredondar2(somarValores(dados.vendas.map((x) => x.valor)))).toBe(164476.16);
    expect(v.ok).toBe(true);
    expect(new Set(dados.vendas.map((x) => x.id)).size).toBe(6916);
  });
});
