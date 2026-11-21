import { describe, expect, it } from "vitest";
import {
  acrescentarDigito, apagarUltimoDigito, arredondar2, calcular, digitsParaValor,
  historicoVigente, somarValores, ticketMedio, troco, HISTORICO_EXPIRA_MS,
} from "../../src/lib/dinheiro";

describe("dinheiro", () => {
  it("arredonda para 2 casas", () => {
    expect(arredondar2(1.994)).toBe(1.99);
    expect(arredondar2(1.996)).toBe(2);
    expect(arredondar2(10.1 + 0.2)).toBe(10.3);
  });

  it("soma valores sem erro de ponto flutuante", () => {
    expect(somarValores([0.1, 0.2])).toBe(0.3);
    expect(somarValores([164476.16])).toBe(164476.16);
  });

  it("calcula ticket médio", () => {
    expect(ticketMedio([])).toBe(0);
    expect(ticketMedio([10, 20, 30])).toBe(20);
    expect(ticketMedio([1.11, 2.22])).toBe(1.67);
  });

  it("digita em centavos e apaga só o último dígito", () => {
    let d = "";
    d = acrescentarDigito(d, "1");
    d = acrescentarDigito(d, "0");
    d = acrescentarDigito(d, "0");
    expect(digitsParaValor(d)).toBe(1);
    d = apagarUltimoDigito(d);
    expect(digitsParaValor(d)).toBe(0.1);
  });

  it("operações e troco", () => {
    expect(calcular(10, 2.5, "+")).toBe(12.5);
    expect(calcular(10, 2.5, "-")).toBe(7.5);
    expect(calcular(10, 3, "*")).toBe(30);
    expect(calcular(10, 4, "/")).toBe(2.5);
    expect(calcular(10, 0, "/")).toBe(10);
    expect(troco(12.3, 20)).toBe(7.7);
    expect(troco(20, 15)).toBe(-5);
  });

  it("histórico some depois de 5 minutos", () => {
    const agora = 1_000_000;
    const itens = [
      { em: agora - HISTORICO_EXPIRA_MS + 1, v: 1 },
      { em: agora - HISTORICO_EXPIRA_MS - 1, v: 2 },
    ];
    expect(historicoVigente(itens, agora).map((i) => i.v)).toEqual([1]);
  });
});
