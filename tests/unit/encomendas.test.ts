import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizarBackup, normalizarEncomenda, parseBackup } from "../../src/lib/importacao";
import {
  encomendaAPagar,
  encomendaAtrasada,
  enderecoPreenchido,
  linkMapa,
  montarPrazo,
  rotuloFormaPagamento,
  statusDeEncomenda,
  textoEndereco,
  textoNotificacaoEncomenda,
  tipoDeEncomenda,
  validarEncomenda,
} from "../../src/lib/encomendas";
import { horarioLocalParaIso, prazoLembretePadrao, zonedParts } from "../../src/lib/datas";

const OFICIAL = "/workspace/controle-vendas/importacao/caixa-importacao-2026-11-22-2049.json";

describe("normalização e migração de encomendas", () => {
  it("preenche campos novos em um registro antigo e preserva pago", () => {
    const e = normalizarEncomenda({
      id: "e1", cliente: "Ana", produto: "Couve", valor: 4.9, pago: true, para_entrega: true,
      endereco: "Rua das Flores, 10",
      criado_em: "2026-01-02T15:00:00.000Z",
    }, "loja");
    expect(e.id).toBe("e1");
    expect(e.tipo).toBe("entrega");
    expect(e.para_entrega).toBe(true);
    expect(e.status).toBe("pendente");
    expect(e.pago).toBe(true);
    expect(e.forma_pagamento).toBeNull();
    expect(e.endereco_detalhe?.rua).toContain("Rua das Flores");
    expect(e.data_entrega).toBeNull();
    expect(e.prazo_lembrete).toBeNull();
    expect(e.telefone).toBeNull();
  });

  it("marca como entregue quando já tinha concluido_em", () => {
    const e = normalizarEncomenda({
      id: "e2", cliente: "Bia", produto: "Leite", valor: 7, pago: false,
      concluido_em: "2026-09-15T22:22:35.027Z", criado_em: "2026-09-13T12:08:20.868Z",
    }, "loja");
    expect(statusDeEncomenda(e)).toBe("entregue");
    expect(tipoDeEncomenda(e)).toBe("retirada");
  });

  it.skipIf(!existsSync(OFICIAL))("mantém as 5 encomendas do backup de 22/11 e só acrescenta campos", () => {
    const dados = normalizarBackup(parseBackup(JSON.parse(readFileSync(OFICIAL, "utf8"))));
    expect(dados.encomendas).toHaveLength(5);
    const ids = dados.encomendas.map((e) => e.id).sort();
    expect(ids).toEqual([
      "00933a6a-53b7-4832-947a-6a1ec31cecac",
      "39a8cc90-338e-4f26-bb2f-84f0d8963948",
      "849f50d5-12f5-4150-89f9-e63204754d37",
      "b7ed0e3f-7004-4be9-814b-946a00c5435b",
      "e89a16cc-40f8-4542-a2ef-dbb83c588ae5",
    ].sort());
    const clovisEntrega = dados.encomendas.find((e) => e.id === "849f50d5-12f5-4150-89f9-e63204754d37")!;
    expect(clovisEntrega.cliente).toBe("Clóvis");
    expect(tipoDeEncomenda(clovisEntrega)).toBe("entrega");
    expect(statusDeEncomenda(clovisEntrega)).toBe("pendente");
    const leite = dados.encomendas.find((e) => e.id === "39a8cc90-338e-4f26-bb2f-84f0d8963948")!;
    expect(statusDeEncomenda(leite)).toBe("entregue");
    expect(leite.concluido_em).toBe("2026-09-15T22:22:35.027Z");
    expect(dados.encomendas.every((e) => e.prazo_lembrete == null)).toBe(true);
  });
});

describe("validação, endereço e pagamento", () => {
  it("exige telefone, data e, na entrega, rua, número e bairro", () => {
    expect(validarEncomenda({ cliente: "Ana", produto: "Couve", telefone: "", tipo: "retirada", data_entrega: "2026-11-23T15:00:00.000Z" })).toMatch(/número/);
    expect(validarEncomenda({ cliente: "Ana", produto: "Couve", telefone: "3899999", tipo: "retirada", data_entrega: null })).toMatch(/data/);
    expect(validarEncomenda({
      cliente: "Ana", produto: "Couve", telefone: "3899999", tipo: "entrega",
      endereco: { rua: "Rua A", numero: "", bairro: "Centro", referencia: "" },
      data_entrega: "2026-11-23T15:00:00.000Z",
    })).toMatch(/rua, número e bairro/);
    expect(validarEncomenda({
      cliente: "Ana", produto: "Couve", telefone: "3899999", tipo: "entrega",
      endereco: { rua: "Rua A", numero: "10", bairro: "Centro", referencia: "portão azul" },
      data_entrega: "2026-11-23T15:00:00.000Z",
    })).toBeNull();
    expect(enderecoPreenchido({ rua: "Rua A", numero: "10", bairro: "Centro", referencia: "" })).toBe(true);
  });

  it("monta texto e link do mapa", () => {
    const end = { rua: "Rua A", numero: "10", bairro: "Centro", referencia: "portão azul" };
    expect(textoEndereco(end)).toContain("Rua A");
    expect(textoEndereco(end)).toContain("nº 10");
    expect(textoEndereco(end)).toContain("Centro");
    expect(textoEndereco(end)).toContain("portão azul");
    expect(linkMapa(end)).toContain("google.com/maps/search");
    expect(linkMapa(end)).toContain(encodeURIComponent("Rua A"));
  });

  it("filtra a pagar e descreve a forma no aviso", () => {
    const base = normalizarEncomenda({ id: "x", cliente: "Ana", produto: "Couve", valor: 10, pago: false }, "loja");
    expect(encomendaAPagar(base)).toBe(true);
    expect(encomendaAPagar({ ...base, pago: true })).toBe(false);
    expect(encomendaAPagar({ ...base, status: "cancelada" })).toBe(false);
    expect(rotuloFormaPagamento("pix")).toBe("Pix");
    expect(rotuloFormaPagamento("fiado")).toBe("Fiado/outro");
    const txt = textoNotificacaoEncomenda({ ...base, forma_pagamento: "pix", telefone: "3899", tipo: "entrega", para_entrega: true, endereco_detalhe: { rua: "Rua A", numero: "1", bairro: "Centro", referencia: "" } }, "nova");
    expect(txt).toMatch(/a pagar/);
    expect(txt).toMatch(/Pix/);
    expect(txt).toMatch(/Rua A/);
    expect(txt).toMatch(/entrega/);
  });
});

describe("lembrete e atraso", () => {
  it("usa 12:00 no fuso America/Sao_Paulo no dia da entrega", () => {
    const data = horarioLocalParaIso("2026-11-23", "16:00");
    const prazo = prazoLembretePadrao(data, "12:00");
    const p = zonedParts(prazo);
    expect(p.chaveDia).toBe("2026-11-23");
    expect(montarPrazo(data, "12:00")).toBe(prazo);
    expect(new Date(prazo).toISOString()).toBe(new Date("2026-11-23T12:00:00-03:00").toISOString());
  });

  it("considera atrasada só se pendente e o prazo já passou", () => {
    const e = normalizarEncomenda({
      id: "a", cliente: "Ana", produto: "Couve", valor: 1, status: "pendente",
      prazo_lembrete: "2026-11-22T15:00:00.000Z",
    }, "loja");
    expect(encomendaAtrasada(e, Date.parse("2026-11-22T15:00:01.000Z"))).toBe(true);
    expect(encomendaAtrasada(e, Date.parse("2026-11-22T14:59:00.000Z"))).toBe(false);
    expect(encomendaAtrasada({ ...e, status: "entregue", concluido_em: "2026-11-22T14:00:00.000Z" }, Date.parse("2026-11-22T16:00:00.000Z"))).toBe(false);
    expect(encomendaAtrasada({ ...e, prazo_lembrete: null }, Date.now())).toBe(false);
  });
});
