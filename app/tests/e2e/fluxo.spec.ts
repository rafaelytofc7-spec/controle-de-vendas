import { test, expect, type Page, type Browser } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const COD = JSON.parse(readFileSync("/home/box/.secrets/controle-vendas/v3-codigos.json", "utf8")).teste;
const tag = Math.random().toString(36).slice(2, 7);
const codigoBarras = "789" + String(Date.now()).slice(-10);

// o celular reaproveita só a sessão anônima entre execuções (o Supabase limita logins anônimos por hora)
const SESS_CEL = "/home/box/.secrets/controle-vendas/sessoes-teste/e2e-celular.json";
async function celular(browser: Browser): Promise<Page> {
  let storageState: any = undefined;
  if (existsSync(SESS_CEL)) {
    const st = JSON.parse(readFileSync(SESS_CEL, "utf8"));
    for (const o of st.origins ?? []) o.localStorage = (o.localStorage ?? []).filter((x: any) => x.name === "cv3-sessao");
    storageState = st;
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, storageState });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("erro na página (celular):", e.message));
  await p.goto("/#caixa");
  await expect(p.getByTestId("visor")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => p.evaluate(() => Object.keys(localStorage).some((k) => k === "cv3-sessao")), { timeout: 20_000 }).toBe(true);
  writeFileSync(SESS_CEL, JSON.stringify(await ctx.storageState()), { mode: 0o600 });
  return p;
}
async function pcAdmin(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // build do PC (sem o código do APK): precisa ligar pelo código de recuperação/convite
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:4175/#caixa");
  return p;
}
const sync = (p: Page) => expect(p.getByTestId("status-sync")).toHaveText(/Online, sincronizado/, { timeout: 20_000 });

test("caixa no celular + admin no PC, em tempo real, offline e leitor", async ({ browser }) => {
  test.setTimeout(240_000);
  const cel = await celular(browser);
  // pede o nome do operador, mas sincroniza mesmo com a pergunta aberta
  await expect(cel.getByTestId("nome-operador")).toBeVisible();
  await sync(cel);
  await cel.getByTestId("nome-operador").fill(`Ana ${tag}`);
  await cel.getByTestId("salvar-operador").click();
  await expect(cel.getByTestId("operador")).toContainText(`Ana ${tag}`);
  await expect(cel.getByTestId("faixa-teste")).toBeVisible();

  // PC: tela de ligar aparelho → código de recuperação (Admin)
  const pc = await pcAdmin(browser);
  await expect(pc.getByTestId("ligar-aparelho")).toBeVisible({ timeout: 30_000 });
  await pc.getByTestId("ligar-codigo").fill(COD.codigo_recuperacao);
  await pc.getByTestId("ligar-entrar").click();
  await expect(pc.getByTestId("menu-fornecedores")).toBeVisible({ timeout: 30_000 });
  await sync(pc);
  await pc.getByRole("button", { name: "Agora não" }).click(); // sem nome: continua funcionando

  // Admin cadastra fornecedor
  await pc.getByTestId("menu-fornecedores").click();
  await pc.getByTestId("novo-fornecedor").click();
  await pc.getByTestId("ff-nome").fill(`Fornecedor ${tag}`);
  await pc.getByTestId("ff-salvar").click();
  await expect(pc.getByTestId("fornecedor").filter({ hasText: `Fornecedor ${tag}` })).toBeVisible();

  // Admin cadastra produto por kg com código digitado pelo "leitor USB" (teclas rápidas + Enter)
  await pc.getByTestId("menu-produtos").click();
  await pc.getByTestId("novo-produto").click();
  await pc.getByTestId("pf-nome").fill(`Banana ${tag}`);
  await pc.getByTestId("pf-un-un").click();
  await pc.getByTestId("pf-preco").fill("6,49");
  await pc.getByTestId("pf-codigo").click();
  await pc.keyboard.type(codigoBarras, { delay: 5 });
  await pc.keyboard.press("Enter");
  await expect(pc.getByText(codigoBarras)).toBeVisible();
  await pc.getByTestId("pf-salvar").click();
  await sync(pc);

  // o produto aparece no celular (tempo real)
  await cel.getByTestId("nav-produtos").click();
  await cel.getByTestId("busca-produtos").fill(tag);
  await expect(cel.getByTestId("produto").filter({ hasText: `Banana ${tag}` })).toBeVisible({ timeout: 15_000 });

  // Chegou mercadoria no celular (Caixa): 30 un por R$ 60, perda 10% → custo 2,22
  await cel.getByTestId("nav-chegou").click();
  await cel.getByTestId("chegou-produto").click();
  await cel.getByTestId("busca-produto").fill(tag);
  await cel.getByTestId("opcao-produto").first().click();
  await cel.getByTestId("chegou-fornecedor").selectOption({ label: `Fornecedor ${tag}` });
  await cel.getByTestId("chegou-qtd").fill("30");
  await cel.getByTestId("chegou-valor").fill("60");
  await cel.getByTestId("chegou-perda").fill("10");
  await expect(cel.getByTestId("custo-efetivo")).toHaveText(/2,22/);
  await expect(cel.getByTestId("chegou-salvar-preco")).toHaveCount(0); // caixa não muda preço
  await cel.getByTestId("chegou-salvar").click();
  await sync(cel);

  // PC vê estoque 27 e custo; calculadora com 35% → 3,49
  await pc.getByTestId("busca-produtos").fill(tag);
  await expect(pc.getByTestId("produto").filter({ hasText: "estoque 27" })).toBeVisible({ timeout: 15_000 });
  await pc.getByTestId("produto").filter({ hasText: `Banana ${tag}` }).click();
  await expect(pc.getByTestId("preco-sugerido")).toContainText("3,49");
  await pc.keyboard.press("Escape");

  // Caixa: leitor USB no caixa (sem campo focado) adiciona o item; 5 toques rápidos = 1 venda
  await cel.getByTestId("nav-caixa").click();
  await cel.locator("body").click({ position: { x: 5, y: 300 } });
  await cel.keyboard.type(codigoBarras, { delay: 5 });
  await cel.keyboard.press("Enter");
  await expect(cel.getByTestId("total")).toHaveText(/6,49/);
  await cel.getByTestId("forma-dinheiro").click();
  await cel.getByTestId("recebido").fill("1000");
  await expect(cel.getByTestId("troco")).toHaveText(/3,51/);
  const reg = cel.getByTestId("registrar");
  await Promise.all([reg.click(), reg.click({ force: true }).catch(() => {}), reg.click({ force: true }).catch(() => {}), reg.click({ force: true }).catch(() => {}), reg.click({ force: true }).catch(() => {})]);
  await sync(cel);
  await expect(cel.getByTestId("recebido")).toHaveCount(0); // limpou
  await pc.getByTestId("menu-caixa").click();
  await pc.getByTestId("resumo-dia").click();
  const linhas = pc.getByTestId("venda-hoje").filter({ hasText: `Banana ${tag}` });
  await expect(linhas).toHaveCount(1, { timeout: 15_000 });
  await expect(linhas).toContainText(`Ana ${tag}`); // a venda leva o nome do operador
  await pc.keyboard.press("Escape");

  // estoque baixou para 26
  await pc.getByTestId("menu-produtos").click();
  await pc.getByTestId("busca-produtos").fill(tag);
  await expect(pc.getByTestId("produto").filter({ hasText: "estoque 26" })).toBeVisible({ timeout: 15_000 });

  // offline: venda rápida fica guardada e sobe quando volta
  await cel.context().setOffline(true);
  await cel.evaluate(() => window.dispatchEvent(new Event("offline")));
  for (const k of ["1", "2", "3", "7"]) await cel.getByTestId("teclado").getByRole("button", { name: k, exact: true }).click();
  await expect(cel.getByTestId("total")).toHaveText(/12,37/);
  await cel.getByTestId("registrar").click();
  await expect(cel.getByTestId("status-sync")).toHaveText(/Offline, 1 aguardando/);
  await cel.context().setOffline(false);
  await cel.evaluate(() => window.dispatchEvent(new Event("online")));
  await sync(cel);
  await pc.getByTestId("menu-caixa").click();
  await pc.getByTestId("resumo-dia").click();
  await expect(pc.getByTestId("venda-hoje").filter({ hasText: "12,37" }).first()).toBeVisible({ timeout: 20_000 });
  await pc.keyboard.press("Escape");

  // ---- vigia da sincronização ----
  // 1) alerta no celular: venda presa na fila há 3 min
  await cel.context().setOffline(true);
  await cel.evaluate(() => window.dispatchEvent(new Event("offline")));
  for (const k of ["4", "5", "6"]) await cel.getByTestId("teclado").getByRole("button", { name: k, exact: true }).click();
  await cel.getByTestId("registrar").click();
  await cel.evaluate(() => (window as any).__cv3.envelhecerFila(3));
  await expect(cel.getByTestId("alerta-sync")).toContainText(/Sincronização atrasada 3 min · 1 faltando/, { timeout: 40_000 });
  // 2) a venda "se perde" da fila (simula falha) antes de subir; volta a internet
  await cel.evaluate(() => (window as any).__cv3.perderFila());
  await cel.context().setOffline(false);
  await cel.evaluate(() => window.dispatchEvent(new Event("online")));
  await sync(cel);
  // o vigia acha a venda que só o celular tem e reenvia a cópia guardada (botão Reenviar tudo)
  await cel.getByTestId("nav-mais").click();
  await cel.getByTestId("mais-ajustes").click();
  await cel.getByTestId("reenviar-tudo").click();
  await expect(cel.getByTestId("toast")).toContainText(/Conferido/, { timeout: 40_000 });
  await sync(cel);
  await pc.getByTestId("menu-caixa").click();
  await pc.getByTestId("resumo-dia").click();
  const v456 = pc.getByTestId("venda-hoje").filter({ hasText: "4,56" }).first();
  await expect(v456).toBeVisible({ timeout: 20_000 });
  await pc.keyboard.press("Escape");
  // 3) o PC "esquece" uma venda → Reenviar tudo baixa do servidor
  const id = await pc.evaluate(() => { const e = (window as any).__cv3.getEstado(); const v = Object.values(e.vendas as Record<string, any>).find((x) => x.total === 4.56); (window as any).__cv3.esquecerVenda(v.id); return v.id; });
  expect(id).toBeTruthy();
  // (o botão "Reenviar tudo" também recarrega tudo; aqui testamos só o vigia, que precisa achar e baixar a venda sozinho)
  for (let i = 0; i < 20 && await pc.evaluate(() => (window as any).__cv3.getEstado().vigia.rodando); i++) await pc.waitForTimeout(500);
  const r = await pc.evaluate(() => (window as any).__cv3.vigiar(true));
  expect(r.baixadas).toBe(1);
  expect(await pc.evaluate((i) => !!(window as any).__cv3.getEstado().vendas[i], id)).toBe(true);
  await pc.getByTestId("menu-ajustes").click();
  await expect(pc.getByTestId("card-sync")).toContainText("1 baixada");
  // 4) PC (Admin) mostra alerta quando outro aparelho informa atraso
  await cel.evaluate(() => (window as any).__cv3.sinalTeste({ pendentes: 2, atraso_seg: 420, faltando_servidor: 0, faltando_aparelho: 0 }));
  await expect(pc.getByTestId("alerta-sync")).toContainText(/atrasado 7 min · 2 faltando/, { timeout: 20_000 });
  await cel.evaluate(() => (window as any).__cv3.sinalTeste({ pendentes: 0, atraso_seg: 0, faltando_servidor: 0, faltando_aparelho: 0, em_dia: true }));
  await expect(pc.getByTestId("alerta-sync").filter({ hasText: "atrasado 7 min" })).toHaveCount(0, { timeout: 20_000 });

  // ---- encomendas: PC cria com sinal, celular (Caixa) vê em tempo real e entrega → vira venda ----
  await pc.getByTestId("menu-encomendas").click();
  await pc.getByTestId("nova-encomenda").click();
  await pc.getByTestId("ef-cliente").fill(`Cliente ${tag}`);
  await pc.getByTestId("ef-descricao").fill("cesta média");
  await pc.getByTestId("ef-busca").fill(tag);
  await pc.getByTestId("ef-produto").first().click();
  await pc.getByTestId("ef-valor").fill("30");
  await pc.getByTestId("ef-sinal").fill("10");
  await pc.getByTestId("ef-salvar").click();
  await expect(pc.getByTestId("toast")).toContainText("sinal de R$ 10,00");
  await cel.getByTestId("nav-mais").click();
  await cel.getByTestId("mais-encomendas").click();
  const encCel = cel.getByTestId("encomenda").filter({ hasText: `Cliente ${tag}` });
  await expect(encCel).toBeVisible({ timeout: 20_000 });
  await encCel.getByTestId("avancar-encomenda").click(); // separando
  await encCel.getByTestId("entregar-encomenda").click();
  await cel.getByTestId("confirmar-entrega").click();
  await expect(cel.getByTestId("toast")).toContainText("venda de R$ 20,00");
  await sync(cel);
  await pc.getByRole("button", { name: "Concluídas" }).click();
  await expect(pc.getByTestId("encomenda").filter({ hasText: `Cliente ${tag}` })).toContainText("Entregue", { timeout: 20_000 });

  // ---- preços por fornecedor: gráfico e comparação ----
  await pc.getByTestId("menu-precos").click();
  await pc.getByTestId("busca-precos").fill(tag);
  await pc.getByTestId("produto-precos").first().click();
  await expect(pc.getByTestId("grafico-precos").locator("svg")).toBeVisible();
  await expect(pc.getByTestId("comparacao-fornecedores")).toContainText(`Fornecedor ${tag}`);
  await expect(pc.getByTestId("comparacao-fornecedores")).toContainText("2,22");

  // ---- promoções: sugestão para o produto com estoque alto, aplica, celular vende pelo preço da promoção ----
  await pc.getByTestId("menu-promocoes").click();
  await pc.getByTestId("atualizar-sugestoes").click();
  const sug = pc.getByTestId("sugestao").filter({ hasText: `Banana ${tag}` });
  await expect(sug).toBeVisible({ timeout: 20_000 });
  await expect(sug).toContainText("de R$ 6,49 por R$ 5,49");
  await sug.getByTestId("aplicar-sugestao").click();
  await expect(pc.getByTestId("promo-ativa").filter({ hasText: `Banana ${tag}` })).toBeVisible();
  await sync(pc);
  await cel.getByTestId("nav-produtos").click();
  await cel.getByTestId("busca-produtos").fill(tag);
  await expect(cel.getByTestId("produto").filter({ hasText: `Banana ${tag}` })).toContainText("promoção", { timeout: 20_000 });
  await cel.getByTestId("nav-caixa").click();
  await cel.locator("body").click({ position: { x: 5, y: 300 } });
  await cel.keyboard.type(codigoBarras, { delay: 5 });
  await cel.keyboard.press("Enter");
  await expect(cel.getByTestId("total")).toHaveText(/5,49/, { timeout: 20_000 });
  await cel.getByTestId("registrar").click();
  await sync(cel);

  // ---- relatório do dia e painel ----
  await pc.getByTestId("menu-relatorios").click();
  await pc.getByTestId("relatorio-hoje").click();
  await expect(pc.getByTestId("relatorio")).toContainText("Vendas", { timeout: 20_000 });
  await expect(pc.getByTestId("relatorio")).toContainText(`Ana ${tag}`);
  await pc.getByTestId("menu-painel").click();
  await expect(pc.getByTestId("painel")).toBeVisible();
  await expect(pc.getByTestId("kpi-total")).not.toHaveText("R$ 0,00");
  await expect(pc.getByTestId("painel")).toContainText(`Ana ${tag}`);
});

test("atualização obrigatória bloqueia o app", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route(/v3_app_versao/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ plataforma: "web", minima: 99999, atual: 99999, nome_atual: "3.1.0", url: "https://exemplo.invalid/app.apk", novidades: "teste" }]) }));
  await p.goto("/#caixa");
  await expect(p.getByTestId("nova-versao")).toBeVisible({ timeout: 30_000 });
  await expect(p.getByText("3.1.0")).toBeVisible();
  await expect(p.getByTestId("registrar")).toHaveCount(0);
});
