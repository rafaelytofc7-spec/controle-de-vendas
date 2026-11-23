import { describe, expect, it } from "vitest";
import { corrigirAutoriaLocalParaEnvio, podeEnviarRegistro, registroImportado } from "../../src/lib/autoria";
import { isPermissionDenied, mensagemErroSync } from "../../src/lib/errosSync";

describe("envio de histórico antigo", () => {
  it("só o Admin envia registros importados", () => {
    expect(registroImportado({ criadoPor: "importado", atualizadoPor: "importado" })).toBe(true);
    expect(registroImportado({ criadoPor: "u1", atualizadoPor: "u1" })).toBe(false);
    expect(podeEnviarRegistro({ criadoPor: "importado", atualizadoPor: "importado" }, true)).toBe(true);
    expect(podeEnviarRegistro({ criadoPor: "importado", atualizadoPor: "importado" }, false)).toBe(false);
    expect(podeEnviarRegistro({ criadoPor: "u1", atualizadoPor: "u1" }, false)).toBe(true);
  });
});

describe("corrigirAutoriaLocalParaEnvio", () => {
  it("troca autor local pelo uid autenticado", () => {
    const { data, alterou } = corrigirAutoriaLocalParaEnvio(
      { id: "v1", criadoPor: "local", atualizadoPor: "local", valor: 10 },
      "uid-abc",
      "Rafael",
    );
    expect(alterou).toBe(true);
    expect(data.criadoPor).toBe("uid-abc");
    expect(data.atualizadoPor).toBe("uid-abc");
    expect(data.criadoPorEmail).toBe("Rafael");
  });

  it("não altera histórico importado", () => {
    const { data, alterou } = corrigirAutoriaLocalParaEnvio(
      { id: "v2", criadoPor: "importado", atualizadoPor: "importado" },
      "uid-abc",
      "Rafael",
    );
    expect(alterou).toBe(false);
    expect(data.criadoPor).toBe("importado");
  });
});

describe("mensagemErroSync", () => {
  it("explica permission-denied e indica a operação", () => {
    expect(isPermissionDenied(new Error("Missing or insufficient permissions"))).toBe(true);
    expect(isPermissionDenied({ code: "permission-denied", message: "x" })).toBe(true);
    expect(mensagemErroSync(new Error("Missing or insufficient permissions"))).toMatch(/permissão/i);
    expect(mensagemErroSync(new Error("Missing or insufficient permissions"), "enviar a venda (abc123)")).toMatch(/enviar a venda \(abc123\)/);
  });
});
