import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acrescentarVendaAgregados, agregarVendas, resumoOuVazio } from "../../src/lib/agregados";
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

describe("acrescentarVendaAgregados", () => {
  it("bate com agregarVendas ao incluir uma venda no fim", () => {
    const a = {
      id: "a", loja: "loja", valor: 10,
      criado_em: "2026-11-23T11:00:00.000-03:00", atualizado_em: "2026-11-23T11:00:00.000-03:00",
      criadoPor: "u1", atualizadoPor: "u1",
    };
    const b = {
      id: "b", loja: "loja", valor: 5.5,
      criado_em: "2026-11-23T11:01:00.000-03:00", atualizado_em: "2026-11-23T11:01:00.000-03:00",
      criadoPor: "u1", atualizadoPor: "u1",
    };
    const base = agregarVendas([a]);
    const inc = acrescentarVendaAgregados(base, b);
    const full = agregarVendas([b, a]);
    expect(inc.total).toEqual(full.total);
    expect(inc.porDia.get("2026-11-23")).toEqual(full.porDia.get("2026-11-23"));
  });
});
