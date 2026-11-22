import { describe, expect, it } from "vitest";
import { configEfetiva, configValida } from "../../src/lib/firebase";
import { FIREBASE_CONFIG_PADRAO, mesmaConfig } from "../../src/lib/firebasePadrao";

describe("configuração padrão da nuvem", () => {
  it("é uma config web válida e é usada quando não há substituição", () => {
    expect(configValida(FIREBASE_CONFIG_PADRAO)).toBe(true);
    expect(FIREBASE_CONFIG_PADRAO.projectId).toBe("controle-de-vendas-bddb9");
    expect(configEfetiva(undefined)).toEqual(FIREBASE_CONFIG_PADRAO);
    expect(configEfetiva(null)).toEqual(FIREBASE_CONFIG_PADRAO);
    expect(configEfetiva({ apiKey: "", authDomain: "", projectId: "", appId: "" })).toEqual(FIREBASE_CONFIG_PADRAO);
  });

  it("respeita uma substituição válida", () => {
    const outra = {
      apiKey: "teste",
      authDomain: "exemplo.firebaseapp.com",
      projectId: "outro-projeto",
      appId: "1:1:web:abc",
    };
    expect(configEfetiva(outra)).toEqual(outra);
    expect(mesmaConfig(configEfetiva(undefined), FIREBASE_CONFIG_PADRAO)).toBe(true);
  });
});
