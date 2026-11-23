import { test, expect } from "@playwright/test";
import { passarDaPorta } from "./helpers";

test("cadastra códigos no cardápio e soma o preço na venda pela leitura", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("./");
  await passarDaPorta(page);
  const comecar = page.getByRole("button", { name: "Começar do zero" });
  if (await comecar.isVisible()) await comecar.click();
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Cardápio" }).click();
  await page.getByRole("button", { name: "Novo" }).click();
  await expect(page.getByTestId("aviso-codigo-kg")).toBeVisible();

  await page.getByLabel("Nome").fill("Suco");
  await page.getByLabel("Preço", { exact: true }).fill("2,50");
  await page.getByLabel("Unidade").fill("un");
  await expect(page.getByTestId("aviso-codigo-kg")).toHaveCount(0);
  await expect(page.getByTestId("codigo-barras-input")).toBeVisible();

  await page.getByTestId("codigo-barras-input").fill("7891000055501");
  await page.getByTestId("adicionar-codigo").click();
  await expect(page.getByTestId("lista-codigos")).toContainText("7891000055501");

  await page.getByTestId("codigo-barras-input").fill("7891000055501");
  await page.getByTestId("adicionar-codigo").click();
  await expect(page.getByTestId("erro-codigo")).toBeVisible();

  await page.getByTestId("codigo-barras-input").fill("7891000055502");
  await page.getByTestId("adicionar-codigo").click();
  await expect(page.getByTestId("lista-codigos")).toContainText("7891000055502");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Suco")).toBeVisible();

  await page.getByRole("button", { name: "Novo" }).click();
  await page.getByLabel("Nome").fill("Caixa");
  await page.getByLabel("Preço", { exact: true }).fill("3");
  await page.getByLabel("Unidade").fill("un");
  await page.getByTestId("codigo-barras-input").fill("7891000055501");
  await page.getByTestId("adicionar-codigo").click();
  await expect(page.getByTestId("erro-codigo")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("link", { name: "Venda" }).click();
  await expect(page.getByTestId("calc-valor")).toBeVisible();

  await page.getByTestId("ler-codigo-venda").click();
  await expect(page.getByTestId("leitor-overlay")).toBeVisible();
  await page.getByTestId("leitor-digitado").fill("7891000055501");
  await page.getByTestId("leitor-usar").click();
  await expect(page.getByTestId("calc-valor")).toContainText("2,50");
  await expect(page.getByTestId("aviso-scan")).toContainText("Suco");

  await page.getByTestId("ler-codigo-venda").click();
  await page.getByTestId("leitor-digitado").fill("7891000055501");
  await page.getByTestId("leitor-usar").click();
  await expect(page.getByTestId("calc-valor")).toContainText("5,00");

  await page.getByTestId("ler-codigo-venda").click();
  await page.getByTestId("leitor-digitado").fill("7890000000001");
  await page.getByTestId("leitor-usar").click();
  await expect(page.getByTestId("cadastro-codigo-desconhecido")).toBeVisible();
  await page.getByTestId("scan-novo-nome").fill("Bala");
  await page.getByTestId("scan-novo-preco").fill("1,00");
  await page.getByTestId("scan-salvar-produto").click();
  await expect(page.getByTestId("calc-valor")).toContainText("6,00");
  await expect(page.getByTestId("aviso-scan")).toContainText("Bala");
});
