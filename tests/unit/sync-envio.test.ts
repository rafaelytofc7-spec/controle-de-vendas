import { describe, expect, it } from "vitest";
import { podeEnviarRegistro, registroImportado } from "../../src/lib/autoria";

describe("envio de histórico antigo", () => {
  it("só o Admin envia registros importados", () => {
    expect(registroImportado({ criadoPor: "importado", atualizadoPor: "importado" })).toBe(true);
    expect(registroImportado({ criadoPor: "u1", atualizadoPor: "u1" })).toBe(false);
    expect(podeEnviarRegistro({ criadoPor: "importado", atualizadoPor: "importado" }, true)).toBe(true);
    expect(podeEnviarRegistro({ criadoPor: "importado", atualizadoPor: "importado" }, false)).toBe(false);
    expect(podeEnviarRegistro({ criadoPor: "u1", atualizadoPor: "u1" }, false)).toBe(true);
  });
});
