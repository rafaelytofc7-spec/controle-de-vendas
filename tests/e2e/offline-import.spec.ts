import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const OFICIAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json");

test("importa o backup e funciona offline no IndexedDB", async ({ page, context }) => {
  test.skip(!existsSync(OFICIAL), "arquivo de importação privada ausente");
  test.setTimeout(180_000);
  await page.goto("./");
  await expect(page.locator(".header h1")).toHaveText("Controle de Vendas");
  await page.getByTestId("import-file").setInputFiles(OFICIAL);

  // After a successful import the first-run screen closes and the cash register opens.
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 90_000 });

  await context.setOffline(true);

  await page.getByRole("link", { name: "Caixa" }).click();
  await expect(page.getByTestId("total-geral")).toContainText("164.476,16");
  await page.getByRole("link", { name: "Mais" }).click();
  await page.getByRole("link", { name: "Encomendas" }).click();
  await expect(page.locator('[data-testid="lista-encomendas"] .item')).toHaveCount(5);
  await page.getByRole("link", { name: "Mais" }).click();
  await page.getByRole("link", { name: "Cobranças" }).click();
  await expect(page.locator('[data-testid="lista-cobrancas"] .item')).toHaveCount(3);

  await page.getByRole("link", { name: "Venda" }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await expect(page.getByTestId("calc-valor")).toContainText("1,00");
  await page.getByTestId("registrar-venda").click();
  await expect(page.getByTestId("total-hoje")).not.toHaveText("");
});
