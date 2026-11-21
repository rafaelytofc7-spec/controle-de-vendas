import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const OFICIAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json");
const ATUAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21-1958.json");
const OUT = resolve("/workspace/controle-vendas/screenshots");

test.use({ viewport: { width: 390, height: 844 } });

test("captura telas da interface nova", async ({ page }) => {
  test.skip(process.env.SHOTS !== "1", "somente com SHOTS=1");
  test.skip(!existsSync(OFICIAL), "sem backup");
  await page.goto("./");
  await page.getByTestId("import-file").setInputFiles(OFICIAL);
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 90_000 });
  // hide store name in the header subtitle for the public-safe capture
  await page.evaluate(() => {
    document.querySelectorAll(".header .sub").forEach((el) => { (el as HTMLElement).textContent = "Minha loja"; });
  });
  await page.screenshot({ path: `${OUT}/01-calculadora.png`, fullPage: false });
  await page.getByRole("link", { name: "Caixa" }).click();
  await expect(page.getByTestId("total-geral")).toBeVisible();
  await page.evaluate(() => {
    document.querySelectorAll(".header .sub").forEach((el) => { (el as HTMLElement).textContent = "Minha loja"; });
  });
  await page.screenshot({ path: `${OUT}/02-livro-caixa.png`, fullPage: false });
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await page.evaluate(() => {
    document.querySelectorAll(".header .sub").forEach((el) => { (el as HTMLElement).textContent = "Minha loja"; });
  });
  await page.screenshot({ path: `${OUT}/03-caixa-escuro.png`, fullPage: false });
});

test("captura os relatórios mensais", async ({ page }) => {
  test.skip(process.env.SHOTS !== "1", "somente com SHOTS=1");
  test.skip(!existsSync(ATUAL), "sem backup atualizado");
  test.setTimeout(120_000);
  await page.goto("./");
  await page.getByTestId("import-file").setInputFiles(ATUAL);
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Relatórios" }).click();
  await expect(page.getByTestId("total-periodo")).toBeVisible();
  await page.evaluate(() => {
    document.querySelectorAll(".header .sub").forEach((el) => { (el as HTMLElement).textContent = "Minha loja"; });
  });
  await page.screenshot({ path: `${OUT}/04-relatorios.png`, fullPage: false });
  await page.getByTestId("mes-2026-11").click();
  await expect(page.getByTestId("total-mes")).toBeVisible();
  await page.evaluate(() => {
    document.querySelectorAll(".header .sub").forEach((el) => { (el as HTMLElement).textContent = "Minha loja"; });
  });
  await page.screenshot({ path: `${OUT}/05-relatorio-mes.png`, fullPage: false });
});
