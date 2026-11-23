import { describe, expect, it } from "vitest";
import { gerarCodigoRecuperacao, nomeValido, pinValido } from "../../src/lib/acesso";

describe("PIN e nomes", () => {
  it("aceita PIN de 4 a 8 números", () => {
    expect(pinValido("2468")).toBe(true);
    expect(pinValido("0000")).toBe(true);
    expect(pinValido("12345678")).toBe(true);
    expect(pinValido("123")).toBe(false);
    expect(pinValido("123456789")).toBe(false);
    expect(pinValido("12ab")).toBe(false);
    expect(pinValido("")).toBe(false);
  });

  it("exige nome de 2 a 40 letras", () => {
    expect(nomeValido("Ra")).toBe(true);
    expect(nomeValido("Rafael")).toBe(true);
    expect(nomeValido("A")).toBe(false);
    expect(nomeValido("   ")).toBe(false);
    expect(nomeValido("x".repeat(41))).toBe(false);
  });

  it("gera código de recuperação de 8 caracteres sem letras ambíguas", () => {
    const c = gerarCodigoRecuperacao();
    expect(c).toMatch(/^[A-Z0-9]{8}$/);
    expect(c).not.toMatch(/[01IO]/);
    const muitos = new Set(Array.from({ length: 40 }, () => gerarCodigoRecuperacao()));
    expect(muitos.size).toBeGreaterThan(30);
  });
});
