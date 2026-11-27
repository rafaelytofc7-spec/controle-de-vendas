import { describe, expect, it } from "vitest";
import { rotuloStatusNuvem } from "../../src/lib/statusNuvem";

describe("rotuloStatusNuvem", () => {
  it("mostra online sincronizado só com o canal inscrito e a fila vazia", () => {
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 0, canalInscrito: true })).toBe("Online, sincronizado");
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 0, canalInscrito: false })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 0 })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: true, enviando: true, vendasAguardando: 0, canalInscrito: true })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 2, canalInscrito: true })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: false, enviando: false, vendasAguardando: 0 })).toBe("Offline");
    expect(rotuloStatusNuvem({ online: false, enviando: false, vendasAguardando: 1 })).toBe("Offline, 1 venda aguardando");
    expect(rotuloStatusNuvem({ online: false, enviando: false, vendasAguardando: 3 })).toBe("Offline, 3 vendas aguardando");
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 0, canalInscrito: true, membro: false })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 0, canalInscrito: true, membro: true })).toBe("Online, sincronizado");
  });
});
