import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agregarVendas, resumoOuVazio } from "../../src/lib/agregados";
import { normalizarBackup, parseBackup, ESPERADO_BACKUP_INICIAL } from "../../src/lib/importacao";
import { zonedParts, mesmoDia, hojeChave, chaveSemana } from "../../src/lib/datas";
import { resumoDia, resumoTotal, totaisPorDia } from "../../src/lib/faturamento";

describe("zonedParts reutiliza o formatador", () => {
  it("devolve a mesma chave em chamadas repetidas", () => {
    const iso = "2026-11-21T21:22:42.000Z";
    expect(zonedParts(iso).chaveDia).toBe(zonedParts(iso).chaveDia);
    expect(mesmoDia(iso, "2026-11-21")).toBe(true);
    expect(hojeChave()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("agregarVendas", () => {
  const oficial = "/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json";
  it.skipIf(!existsSync(oficial))("bate com o total oficial em uma única passada", () => {
    const dados = normalizarBackup(parseBackup(JSON.parse(readFileSync(oficial, "utf8"))));
    const ag = agregarVendas(dados.vendas);
    expect(ag.total.quantidade).toBe(ESPERADO_BACKUP_INICIAL.vendas);
    expect(ag.total.total).toBe(ESPERADO_BACKUP_INICIAL.total_vendas);
    const t = resumoTotal(dados.vendas);
    expect(ag.total.total).toBe(t.total);
    const um = dados.vendas[0];
    const dia = zonedParts(um.criado_em).chaveDia;
    expect(resumoOuVazio(ag.porDia, dia).total).toBe(resumoDia(dados.vendas, dia).total);
    expect(totaisPorDia(dados.vendas).get(dia)).toBe(ag.porDia.get(dia)?.total);
    expect(ag.porSemana.get(chaveSemana(um.criado_em))?.quantidade).toBeGreaterThan(0);
  });
});
