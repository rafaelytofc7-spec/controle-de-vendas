import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import { importarDados, listarVendas, resetarBanco, bancoTemDados } from "../../src/lib/db";
import { normalizarBackup, parseBackup, ESPERADO_BACKUP_INICIAL, ESPERADO_BACKUP_ATUALIZADO } from "../../src/lib/importacao";
import { somarValores } from "../../src/lib/dinheiro";

const ANTIGO = "/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json";
const ATUAL = "/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21-1958.json";

function carregar(path: string) {
  return normalizarBackup(parseBackup(JSON.parse(readFileSync(path, "utf8"))));
}

describe("importação mescla pelo id sem duplicar", () => {
  beforeEach(async () => {
    await resetarBanco();
  });

  it.skipIf(!existsSync(ANTIGO) || !existsSync(ATUAL))("importa o arquivo antigo e depois o de atualização", async () => {
    const velho = carregar(ANTIGO);
    const r1 = await importarDados(velho, true);
    expect(r1.modo).toBe("substituir");
    let vendas = await listarVendas();
    expect(vendas).toHaveLength(ESPERADO_BACKUP_INICIAL.vendas);
    expect(somarValores(vendas.map((v) => v.valor))).toBe(ESPERADO_BACKUP_INICIAL.total_vendas);
    expect(new Set(vendas.map((v) => v.id)).size).toBe(ESPERADO_BACKUP_INICIAL.vendas);

    const novo = carregar(ATUAL);
    const r2 = await importarDados(novo, false);
    expect(r2.modo).toBe("mesclar");
    expect(r2.adicionados.vendas).toBe(1);
    expect((r2.atualizados.vendas ?? 0) + (r2.mantidos.vendas ?? 0)).toBe(ESPERADO_BACKUP_INICIAL.vendas);

    vendas = await listarVendas();
    expect(vendas).toHaveLength(ESPERADO_BACKUP_ATUALIZADO.vendas);
    expect(somarValores(vendas.map((v) => v.valor))).toBe(ESPERADO_BACKUP_ATUALIZADO.total_vendas);
    expect(new Set(vendas.map((v) => v.id)).size).toBe(ESPERADO_BACKUP_ATUALIZADO.vendas);
    expect(await bancoTemDados()).toBe(true);

    const r3 = await importarDados(novo, false);
    expect(r3.adicionados.vendas ?? 0).toBe(0);
    vendas = await listarVendas();
    expect(vendas).toHaveLength(ESPERADO_BACKUP_ATUALIZADO.vendas);
    expect(somarValores(vendas.map((v) => v.valor))).toBe(ESPERADO_BACKUP_ATUALIZADO.total_vendas);
  }, 60_000);
});
