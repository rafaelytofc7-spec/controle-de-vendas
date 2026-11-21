import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agregarVendas } from "../../src/lib/agregados";
import { normalizarBackup, parseBackup, ESPERADO_BACKUP_ATUALIZADO } from "../../src/lib/importacao";
import { somarValores } from "../../src/lib/dinheiro";
import {
  ESPERADO_TOTAIS_MENSAIS_ATUAL,
  formatarVariacao,
  intervaloRelatorio,
  montarLinhasMes,
  totalDoPeriodo,
  variacaoPercentual,
} from "../../src/lib/relatorio";

const ATUAL = "/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21-1958.json";

describe("totais mensais do backup atualizado", () => {
  it.skipIf(!existsSync(ATUAL))("somam o total geral e batem com cada mês", () => {
    const dados = normalizarBackup(parseBackup(JSON.parse(readFileSync(ATUAL, "utf8"))));
    const ag = agregarVendas(dados.vendas);
    expect(ag.total.total).toBe(ESPERADO_BACKUP_ATUALIZADO.total_vendas);
    expect(ag.total.quantidade).toBe(ESPERADO_BACKUP_ATUALIZADO.vendas);

    const { de, ate } = intervaloRelatorio(ag.porMes, "2026-11-21");
    expect(de).toBe("2026-08");
    expect(ate).toBe("2026-11");
    const linhas = montarLinhasMes(ag, de, ate);
    expect(linhas.map((l) => l.chave)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);

    for (const esp of ESPERADO_TOTAIS_MENSAIS_ATUAL) {
      const l = linhas.find((x) => x.chave === esp.chave);
      expect(l?.total).toBe(esp.total);
      expect(l?.quantidade).toBe(esp.quantidade);
    }

    const soma = somarValores(linhas.map((l) => l.total));
    expect(soma).toBe(164518.86);
    expect(totalDoPeriodo(linhas).total).toBe(164518.86);
    expect(totalDoPeriodo(linhas).quantidade).toBe(6917);
    expect(linhas[0].variacao).toBeNull();
    expect(linhas[1].variacao).toBe(variacaoPercentual(56617.12, 13132.97));
    expect(linhas[2].variacao).toBeLessThan(0);
  });
});

describe("formatarVariacao", () => {
  it("mostra ganho, perda e vazio", () => {
    expect(formatarVariacao(null)).toBe("—");
    expect(formatarVariacao(0)).toBe("0%");
    expect(formatarVariacao(10)).toBe("+10%");
    expect(formatarVariacao(-8.9)).toBe("-8,9%");
  });
});
