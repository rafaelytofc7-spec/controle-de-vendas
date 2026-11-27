// Testes do banco v3 na loja "teste" (projeto real, chave publicável, login anônimo).
// Uso: node tests/servidor/servidor.test.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const URL = "https://zmsertdphnhaontkojqa.supabase.co";
const KEY = readFileSync("/home/box/.secrets/controle-vendas/supabase-publishable.key", "utf8").trim();
const COD = JSON.parse(readFileSync("/home/box/.secrets/controle-vendas/v3-codigos.json", "utf8")).teste;
const LOJA = "teste";
const novo = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function anon() { const c = novo(); const { error } = await c.auth.signInAnonymously(); if (error) throw error; return c; }
const rpc = async (c, f, a) => { const { data, error } = await c.rpc(f, a); if (error) throw new Error(error.message); return data; };
const semAcesso = async (p) => { const r = await p; assert.equal(r.erro, "codigo_invalido"); assert.equal(r.papel, undefined); };
const falha = async (p, re) => { try { await p; } catch (e) { assert.match(e.message, re); return; } assert.fail("deveria falhar: " + re); };
let ok = 0; const t = async (nome, fn) => { const t0 = Date.now(); await fn(); ok++; console.log(`✔ ${nome} (${Date.now() - t0} ms)`); };

const estranho = await anon();
const caixa = await anon();
const admin = await anon();
const tag = randomUUID().slice(0, 6);

await t("sem código não entra e não lê nada", async () => {
  await semAcesso(rpc(estranho, "v3_entrar", { p_loja: LOJA, p_codigo: "ERRADO123", p_nome: "x" }));
  const { data } = await estranho.from("v3_vendas").select("id").eq("loja_id", LOJA).limit(5);
  assert.equal(data.length, 0);
  const ins = await estranho.from("v3_vendas").insert({ loja_id: LOJA, id: "x", total: 1, criado_em: new Date().toISOString() });
  assert.ok(ins.error, "insert direto deveria ser negado");
  const sec = await estranho.from("v3_loja_segredos").select("*");
  assert.ok(sec.error || sec.data.length === 0);
});

await t("código do APK entra como Caixa; recuperação entra como Admin", async () => {
  assert.equal((await rpc(caixa, "v3_entrar", { p_loja: LOJA, p_codigo: COD.codigo_entrada, p_nome: "Caixa teste", p_plataforma: "web", p_versao: 30001 })).papel, "caixa");
  assert.equal((await rpc(caixa, "v3_entrar", { p_loja: LOJA, p_nome: "Caixa teste" })).papel, "caixa"); // já é membro, sem código
  assert.equal((await rpc(admin, "v3_entrar", { p_loja: LOJA, p_codigo: COD.codigo_recuperacao, p_nome: "Admin teste" })).papel, "admin");
});

const prod = `p-${tag}`, forn = `f-${tag}`;
await t("Caixa cadastra produto novo mas não edita preço, fornecedor nem estoque", async () => {
  await rpc(caixa, "v3_salvar_produto", { p_loja: LOJA, p: { id: prod, nome: `Tomate ${tag}`, unidade: "kg", preco: 8.99, codigos: [`789${tag.replace(/\D/g, "1").padEnd(6, "1")}`] } });
  await falha(rpc(caixa, "v3_salvar_produto", { p_loja: LOJA, p: { id: prod, preco: 1 } }), /so_admin/);
  await falha(rpc(caixa, "v3_definir_preco", { p_loja: LOJA, p_produto: prod, p_preco: 1 }), /so_admin/);
  await falha(rpc(caixa, "v3_salvar_fornecedor", { p_loja: LOJA, p: { id: "x", nome: "x" } }), /so_admin/);
  await falha(rpc(caixa, "v3_contagem", { p_loja: LOJA, p: { id: "c", itens: [] } }), /so_admin/);
  await falha(rpc(caixa, "v3_criar_convite", { p_loja: LOJA, p_papel: "admin" }), /so_admin/);
});

await t("Admin: fornecedor, contagem inicial e entrada → custo médio certo", async () => {
  await rpc(admin, "v3_salvar_fornecedor", { p_loja: LOJA, p: { id: forn, nome: `Fornecedor ${tag}`, tipo: "Ceasa" } });
  await rpc(admin, "v3_contagem", { p_loja: LOJA, p: { id: `c-${tag}`, itens: [{ produto_id: prod, quantidade: 10, custo: 5 }] } });
  const r = await rpc(caixa, "v3_registrar_entrada", { p_loja: LOJA, p_plataforma: "web", p_versao: 30001,
    p: { id: `e-${tag}`, fornecedor_id: forn, frete: 4, itens: [{ id: `e-${tag}-1`, produto_id: prod, quantidade: 20, valor_pago: 100, perda_pct: 8 }] } });
  assert.ok(Math.abs(r.itens[0].custo_efetivo - 104 / 18.4) < 1e-3);
  const rep = await rpc(caixa, "v3_registrar_entrada", { p_loja: LOJA, p: { id: `e-${tag}`, itens: [] } });
  assert.equal(rep.repetida, true);
  const { data: c } = await caixa.from("v3_produto_custos").select("*").eq("loja_id", LOJA).eq("produto_id", prod).single();
  assert.ok(Math.abs(Number(c.estoque) - 28.4) < 1e-9, `estoque ${c.estoque}`);
  const esperado = (10 * 5 + 18.4 * (104 / 18.4)) / 28.4;
  assert.ok(Math.abs(Number(c.custo_medio) - esperado) < 1e-3, `médio ${c.custo_medio} vs ${esperado}`);
  const { data: pd } = await admin.from("v3_precos_diarios").select("*").eq("loja_id", LOJA).eq("produto_id", prod);
  assert.equal(pd.length, 1); assert.equal(pd[0].fornecedor_id, forn);
});

const venda = randomUUID();
await t("venda com itens: baixa estoque, guarda custo, reenvio não duplica", async () => {
  const p = { id: venda, total: 11.24, forma: "pix", criado_em: new Date().toISOString(),
    itens: [{ id: `${venda}-1`, produto_id: prod, nome: "Tomate", unidade: "kg", quantidade: 1.25, preco_unit: 8.99, total: 11.24 }] };
  await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p, p_plataforma: "web", p_versao: 30001 });
  const r2 = await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p, p_plataforma: "web", p_versao: 30001 });
  assert.equal(r2.repetida, true);
  const { data: v } = await caixa.from("v3_vendas").select("*").eq("loja_id", LOJA).eq("id", venda).single();
  assert.equal(v.tem_itens, true); assert.ok(Number(v.custo_total) > 6 && Number(v.custo_total) < 7.5);
  const { data: c } = await caixa.from("v3_produto_custos").select("estoque").eq("loja_id", LOJA).eq("produto_id", prod).single();
  assert.ok(Math.abs(Number(c.estoque) - 27.15) < 1e-9, `estoque ${c.estoque}`);
});

await t("venda rápida só com valor", async () => {
  const id = randomUUID();
  await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p: { id, total: 7.5, criado_em: new Date().toISOString() }, p_plataforma: "web", p_versao: 30001 });
  const { data: v } = await caixa.from("v3_vendas").select("tem_itens,custo_total,origem").eq("loja_id", LOJA).eq("id", id).single();
  assert.deepEqual(v, { tem_itens: false, custo_total: null, origem: "v3" });
});

await t("Caixa apaga a própria venda e o estoque volta", async () => {
  await rpc(caixa, "v3_excluir_venda", { p_loja: LOJA, p_id: venda });
  const { data: c } = await caixa.from("v3_produto_custos").select("estoque").eq("loja_id", LOJA).eq("produto_id", prod).single();
  assert.ok(Math.abs(Number(c.estoque) - 28.4) < 1e-9);
  await rpc(caixa, "v3_excluir_venda", { p_loja: LOJA, p_id: venda }); // de novo: não mexe
  const { data: c2 } = await caixa.from("v3_produto_custos").select("estoque").eq("loja_id", LOJA).eq("produto_id", prod).single();
  assert.equal(Number(c2.estoque), Number(c.estoque));
});

await t("tempo real: venda de um aparelho chega no outro", async () => {
  const id = randomUUID();
  const chegou = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("não chegou em 10 s")), 10000);
    const ch = admin.channel(`t-${tag}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "v3_vendas", filter: `loja_id=eq.${LOJA}` }, (p) => {
      if (p.new.id === id) { clearTimeout(timer); res(Date.now()); admin.removeChannel(ch); }
    }).subscribe(async (s, err) => {
      if (s !== "SUBSCRIBED") console.log("   canal:", s, err?.message ?? "");
      if (s === "SUBSCRIBED") { globalThis.t0 = Date.now(); await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p: { id, total: 3, criado_em: new Date().toISOString() }, p_plataforma: "web", p_versao: 30001 }); }
    });
  });
  const fim = await chegou;
  console.log(`   chegou em ${fim - globalThis.t0} ms`);
});

await t("convite de uso único (QR) e bloqueio de aparelho", async () => {
  const { codigo } = await rpc(admin, "v3_criar_convite", { p_loja: LOJA, p_papel: "caixa" });
  const novoAp = await anon(); const outro = await anon();
  assert.equal((await rpc(novoAp, "v3_entrar", { p_loja: LOJA, p_codigo: codigo, p_nome: "Convidado" })).papel, "caixa");
  await semAcesso(rpc(outro, "v3_entrar", { p_loja: LOJA, p_codigo: codigo, p_nome: "Outro" }));
  const { data: { user } } = await novoAp.auth.getUser();
  await rpc(admin, "v3_definir_aparelho", { p_loja: LOJA, p_uid: user.id, p_papel: null, p_bloqueado: true });
  await falha(rpc(novoAp, "v3_registrar_venda", { p_loja: LOJA, p: { id: randomUUID(), total: 1 } }), /sem_acesso/);
  const { data } = await novoAp.from("v3_vendas").select("id").eq("loja_id", LOJA).limit(1);
  assert.equal(data.length, 0);
  await falha(rpc(novoAp, "v3_entrar", { p_loja: LOJA }), /bloqueado/);
});

await t("muitas tentativas erradas são bloqueadas", async () => {
  const c = await anon();
  for (let i = 0; i < 8; i++) await semAcesso(rpc(c, "v3_entrar", { p_loja: LOJA, p_codigo: `ERRADO${i}` }));
  await falha(rpc(c, "v3_entrar", { p_loja: LOJA, p_codigo: COD.codigo_recuperacao }), /muitas_tentativas/);
});

await t("Caixa não lê outra loja", async () => {
  const { data } = await caixa.from("v3_vendas").select("id").eq("loja_id", "ensaio").limit(1);
  assert.equal(data.length, 0);
  const { data: d2 } = await caixa.from("vendas").select("id").limit(1);
  assert.equal((d2 ?? []).length, 0, "tabela antiga não deve abrir para aparelho v3");
});

console.log(`\n${ok} testes do servidor passaram.`);
process.exit(0);
