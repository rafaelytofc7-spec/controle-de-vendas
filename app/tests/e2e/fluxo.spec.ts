import { test, expect, type Page, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";

const COD = JSON.parse(readFileSync("/home/box/.secrets/controle-vendas/v3-codigos.json", "utf8")).teste;
const tag = Math.random().toString(36).slice(2, 7);
const codigoBarras = "789" + String(Date.now()).slice(-10);

async function celular(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto("/#caixa");
  await expect(p.getByTestId("visor")).toBeVisible({ timeout: 30_000 });
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
  const cel = await celular(browser);
  await sync(cel);
  await expect(cel.getByTestId("faixa-teste")).toBeVisible();

  // PC: tela de ligar aparelho → código de recuperação (Admin)
  const pc = await pcAdmin(browser);
  await expect(pc.getByTestId("ligar-aparelho")).toBeVisible({ timeout: 30_000 });
  await pc.getByTestId("ligar-codigo").fill(COD.codigo_recuperacao);
  await pc.getByTestId("ligar-entrar").click();
  await expect(pc.getByTestId("menu-fornecedores")).toBeVisible({ timeout: 30_000 });
  await sync(pc);

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
