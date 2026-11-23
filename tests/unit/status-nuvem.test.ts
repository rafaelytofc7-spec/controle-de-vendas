import { describe, expect, it } from "vitest";
import { rotuloStatusNuvem } from "../../src/lib/statusNuvem";

describe("rotuloStatusNuvem", () => {
  it("mostra online sincronizado, enviando e a fila offline", () => {
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 0 })).toBe("Online, sincronizado");
    expect(rotuloStatusNuvem({ online: true, enviando: true, vendasAguardando: 0 })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: true, enviando: false, vendasAguardando: 2 })).toBe("Enviando...");
    expect(rotuloStatusNuvem({ online: false, enviando: false, vendasAguardando: 0 })).toBe("Offline");
    expect(rotuloStatusNuvem({ online: false, enviando: false, vendasAguardando: 1 })).toBe("Offline, 1 venda aguardando");
    expect(rotuloStatusNuvem({ online: false, enviando: false, vendasAguardando: 3 })).toBe("Offline, 3 vendas aguardando");
  });
});
