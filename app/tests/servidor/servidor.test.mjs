// Testes do banco v3 na loja "teste" (projeto real, chave publicável, login anônimo).
// Uso: node tests/servidor/servidor.test.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const URL = "https://zmsertdphnhaontkojqa.supabase.co";
const KEY = readFileSync("/home/box/.secrets/controle-vendas/supabase-publishable.key", "utf8").trim();
const COD = JSON.parse(readFileSync("/home/box/.secrets/controle-vendas/v3-codigos.json", "utf8")).teste;
const LOJA = "teste";
const novo = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function anon() { const c = novo(); const { error } = await c.auth.signInAnonymously(); if (error) throw error; return c; }
// sessões reaproveitadas entre execuções (o Supabase limita logins anônimos por hora por internet)
const PASTA_SESS = "/home/box/.secrets/controle-vendas/sessoes-teste";
async function sessao(nome) {
  mkdirSync(PASTA_SESS, { recursive: true, mode: 0o700 });
  const f = `${PASTA_SESS}/${nome}.json`;
  const mem = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; writeFileSync(f, JSON.stringify(mem), { mode: 0o600 }); }, removeItem: (k) => { delete mem[k]; writeFileSync(f, JSON.stringify(mem), { mode: 0o600 }); } };
  const c = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: false, storage, storageKey: "sb-teste" } });
  const { data: { session } } = await c.auth.getSession();
  if (!session) { const { error } = await c.auth.signInAnonymously(); if (error) throw error; }
  return c;
}
const rpc = async (c, f, a) => { const { data, error } = await c.rpc(f, a); if (error) throw new Error(error.message); return data; };
const semAcesso = async (p) => { const r = await p; assert.equal(r.erro, "codigo_invalido"); assert.equal(r.papel, undefined); };
const falha = async (p, re) => { try { await p; } catch (e) { assert.match(e.message, re); return; } assert.fail("deveria falhar: " + re); };
let ok = 0; const t = async (nome, fn) => { const t0 = Date.now(); await fn(); ok++; console.log(`✔ ${nome} (${Date.now() - t0} ms)`); };

const estranho = await sessao("estranho");
const caixa = await sessao("caixa");
const admin = await sessao("admin");
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
  assert.equal((await rpc(caixa, "v3_entrar", { p_loja: LOJA, p_codigo: COD.codigo_entrada, p_nome: "Caixa teste", p_plataforma: "web", p_versao: 30005 })).papel, "caixa");
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
  const r = await rpc(caixa, "v3_registrar_entrada", { p_loja: LOJA, p_plataforma: "web", p_versao: 30005,
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
  await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p, p_plataforma: "web", p_versao: 30005 });
  const r2 = await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p, p_plataforma: "web", p_versao: 30005 });
  assert.equal(r2.repetida, true);
  const { data: v } = await caixa.from("v3_vendas").select("*").eq("loja_id", LOJA).eq("id", venda).single();
  assert.equal(v.tem_itens, true); assert.ok(Number(v.custo_total) > 6 && Number(v.custo_total) < 7.5);
  const { data: c } = await caixa.from("v3_produto_custos").select("estoque").eq("loja_id", LOJA).eq("produto_id", prod).single();
  assert.ok(Math.abs(Number(c.estoque) - 27.15) < 1e-9, `estoque ${c.estoque}`);
});

await t("venda rápida só com valor", async () => {
  const id = randomUUID();
  await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p: { id, total: 7.5, criado_em: new Date().toISOString() }, p_plataforma: "web", p_versao: 30005 });
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
  const { data: { session } } = await admin.auth.getSession();
  admin.realtime.setAuth(session.access_token);
  const chegou = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("não chegou em 15 s")), 15000);
    const ch = admin.channel(`t-${tag}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "v3_vendas", filter: `loja_id=eq.${LOJA}` }, (p) => {
      if (p.new.id === id) { clearTimeout(timer); res(Date.now()); admin.removeChannel(ch); }
    }).subscribe(async (s, err) => {
      if (s !== "SUBSCRIBED") console.log("   canal:", s, err?.message ?? "");
      if (s === "SUBSCRIBED") { await new Promise((ok) => setTimeout(ok, 1500)); /* o servidor leva ~1 s para ligar a escuta depois do SUBSCRIBED */ globalThis.t0 = Date.now(); await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p: { id, total: 3, criado_em: new Date().toISOString() }, p_plataforma: "web", p_versao: 30005 }); }
    });
  });
  const fim = await chegou;
  console.log(`   chegou em ${fim - globalThis.t0} ms`);
});

await t("APK novo entra sozinho como Caixa; PC sem código não; Caixa não mexe em preço/fornecedor/promoção", async () => {
  // aparelho realmente novo (1 login anônimo por execução)
  const apk = await anon();
  const r = await rpc(apk, "v3_entrar", { p_loja: LOJA, p_nome: "Celular novo", p_plataforma: "android", p_versao: 30005 });
  assert.equal(r.papel, "caixa");
  assert.equal((await rpc(apk, "v3_entrar", { p_loja: LOJA, p_plataforma: "android" })).papel, "caixa");
  // site do PC sem código continua fechado
  await semAcesso(rpc(estranho, "v3_entrar", { p_loja: LOJA, p_nome: "PC", p_plataforma: "web" }));
  await semAcesso(rpc(estranho, "v3_entrar", { p_loja: LOJA, p_nome: "PC" }));
  // loja sem caixa automático (principal) não deixa entrar
  const p = await rpc(apk, "v3_entrar", { p_loja: "principal", p_plataforma: "android" });
  assert.equal(p.papel, undefined);
  const pid = `p-auto-${tag}`;
  await rpc(apk, "v3_salvar_produto", { p_loja: LOJA, p: { id: pid, nome: `Auto ${tag}`, unidade: "un", preco: 9.99 } });
  const { data: prod } = await apk.from("v3_produtos").select("preco").eq("loja_id", LOJA).eq("id", pid).single();
  assert.equal(Number(prod.preco), 0, "Caixa não define preço nem no cadastro");
  await falha(rpc(apk, "v3_salvar_produto", { p_loja: LOJA, p: { id: pid, preco: 1 } }), /so_admin/);
  await falha(rpc(apk, "v3_definir_preco", { p_loja: LOJA, p_produto: pid, p_preco: 1 }), /so_admin/);
  await falha(rpc(apk, "v3_salvar_fornecedor", { p_loja: LOJA, p: { id: `f-${tag}`, nome: "X" } }), /so_admin/);
  await falha(rpc(apk, "v3_definir_promocao", { p_loja: LOJA, p_produto: pid, p_preco: 1, p_dias: 1, p_dia_sugestao: null }), /so_admin/);
  await falha(rpc(apk, "v3_contagem", { p_loja: LOJA, p: { id: `c-${tag}`, itens: [] } }), /so_admin/);
  // Caixa registra entrada de mercadoria
  const e = await rpc(apk, "v3_registrar_entrada", { p_loja: LOJA, p_plataforma: "android", p_versao: 30005,
    p: { id: `e-auto-${tag}`, itens: [{ produto_id: pid, quantidade: 4, valor_pago: 10 }] } });
  assert.equal(e.ok, true);
  // leituras só de Admin
  for (const tb of ["v3_precos_diarios", "v3_promocoes_sugeridas", "v3_atividades"]) {
    const { data } = await apk.from(tb).select("loja_id").eq("loja_id", LOJA).limit(1);
    assert.equal(data.length, 0, `Caixa não deveria ler ${tb}`);
    const { data: d2 } = await admin.from(tb).select("loja_id").eq("loja_id", LOJA).limit(1);
    assert.equal(d2.length, 1, `Admin deveria ler ${tb}`);
  }
  // aparelho de teste removido da lista (bloqueado) para não acumular
  const { data: { user } } = await apk.auth.getUser();
  await rpc(admin, "v3_definir_aparelho", { p_loja: LOJA, p_uid: user.id, p_papel: null, p_bloqueado: true });
});

await t("convite de uso único (QR) e bloqueio de aparelho", async () => {
  const { codigo } = await rpc(admin, "v3_criar_convite", { p_loja: LOJA, p_papel: "caixa" });
  const novoAp = await anon(); const outro = await sessao("outro");
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
  const c = await sessao("tentador");
  // (se rodou há menos de 10 min, o bloqueio já pode estar valendo)
  for (let i = 0; i < 8; i++) { try { await semAcesso(rpc(c, "v3_entrar", { p_loja: LOJA, p_codigo: `ERRADO${i}` })); } catch (e) { if (/muitas_tentativas/.test(e.message)) break; throw e; } }
  await falha(rpc(c, "v3_entrar", { p_loja: LOJA, p_codigo: COD.codigo_recuperacao }), /muitas_tentativas/);
});

await t("Caixa não lê outra loja", async () => {
  const { data } = await caixa.from("v3_vendas").select("id").eq("loja_id", "ensaio").limit(1);
  assert.equal(data.length, 0);
  const { data: d2 } = await caixa.from("vendas").select("id").limit(1);
  assert.equal((d2 ?? []).length, 0, "tabela antiga não deve abrir para aparelho v3");
});


await t("vigia: operador na venda, sinal com manifesto igual ao recalculado, ids do dia", async () => {
  const { createHash } = await import("node:crypto");
  const vid = `vg-${tag}`;
  await rpc(caixa, "v3_registrar_venda", { p_loja: LOJA, p_plataforma: "web", p_versao: 30005, p: { id: vid, total: 7.25, forma: "pix", operador: `Bia ${tag}`, criado_em: new Date().toISOString() } });
  const { data: v } = await caixa.from("v3_vendas").select("operador").eq("loja_id", LOJA).eq("id", vid).single();
  assert.equal(v.operador, `Bia ${tag}`);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const r = await rpc(caixa, "v3_sync_sinal", { p_loja: LOJA, p_versao: 30005, p: { operador: `Bia ${tag}`, pendentes: 3, atraso_seg: 300, de: dia } });
  const ids = await rpc(caixa, "v3_sync_ids", { p_loja: LOJA, p_dia: dia });
  assert.ok(ids.some(([id]) => id === vid));
  const h = createHash("sha256").update(ids.map(([id, ex]) => id + (ex ? ":x" : "")).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(",")).digest("hex");
  assert.equal(r.dias[dia].hash, h, "hash do servidor = hash recalculado no aparelho");
  const { data: a } = await admin.from("v3_aparelhos").select("operador,pendentes,atraso_seg,sync_em").eq("loja_id", LOJA).eq("nome", "Caixa teste");
  assert.ok(a.some((x) => x.operador === `Bia ${tag}` && x.pendentes === 3 && x.atraso_seg === 300 && x.sync_em));
  await falha(rpc(estranho, "v3_sync_ids", { p_loja: LOJA, p_dia: dia }), /sem_acesso|42501|permission/);
  await rpc(caixa, "v3_sync_sinal", { p_loja: LOJA, p_versao: 30005, p: { operador: `Bia ${tag}`, pendentes: 0, atraso_seg: 0, em_dia: true } });
});

await t("backup: exportação só com a chave (aparelho e chave errada não conseguem)", async () => {
  await falha(rpc(novo(), "v3_backup_exportar", { p_loja: LOJA, p_chave: "x".repeat(40) }), /chave_invalida/);
  await falha(rpc(caixa, "v3_backup_exportar", { p_loja: LOJA, p_chave: "x".repeat(40) }), /permission|42501|not find|chave_invalida/);
  const chave = readFileSync("/home/box/.secrets/controle-vendas/v3-backup-chave.txt", "utf8").trim();
  const r = await rpc(novo(), "v3_backup_exportar", { p_loja: LOJA, p_chave: chave, p_desde: new Date(Date.now() - 3600_000).toISOString() });
  assert.ok(r.vendas.some((x) => x.id === `vg-${tag}` && x.operador === `Bia ${tag}`));
  assert.ok(r.manifesto && r.cadastro.produtos.length > 0);
});

console.log(`\n${ok} testes do servidor passaram.`);
process.exit(0);
