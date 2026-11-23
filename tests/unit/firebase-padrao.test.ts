import { describe, expect, it } from "vitest";
import { configEfetiva, configValida } from "../../src/lib/supabase";
import { SUPABASE_CONFIG_PADRAO, mesmaConfig, LOJA_NUVEM_ID } from "../../src/lib/supabasePadrao";

describe("configuração padrão da nuvem", () => {
  it("é uma config web válida e é usada quando não há substituição", () => {
    expect(configValida(SUPABASE_CONFIG_PADRAO)).toBe(true);
    expect(SUPABASE_CONFIG_PADRAO.url).toContain("zmsertdphnhaontkojqa");
    expect(SUPABASE_CONFIG_PADRAO.anonKey.length).toBeGreaterThan(20);
    expect(configEfetiva(undefined)).toEqual(SUPABASE_CONFIG_PADRAO);
    expect(configEfetiva(null)).toEqual(SUPABASE_CONFIG_PADRAO);
    expect(configEfetiva({ url: "", anonKey: "" })).toEqual(SUPABASE_CONFIG_PADRAO);
  });

  it("respeita uma substituição válida", () => {
    const outra = {
      url: "https://exemplo.supabase.co",
      anonKey: "teste-anon-key-com-tamanho-ok",
    };
    expect(configEfetiva(outra)).toEqual(outra);
    expect(mesmaConfig(configEfetiva(undefined), SUPABASE_CONFIG_PADRAO)).toBe(true);
  });

  it("usa a loja principal por padrão", () => {
    expect(LOJA_NUVEM_ID).toBe("principal");
  });
});
