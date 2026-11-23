import { test, expect } from "@playwright/test";
import { passarDaPorta } from "./helpers";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ANTIGO = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json");
const ATUAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21-1958.json");

test("mescla o arquivo de atualização sem duplicar vendas", async ({ page }) => {
  test.skip(!existsSync(ANTIGO) || !existsSync(ATUAL), "arquivos de importação ausentes");
  test.setTimeout(180_000);
  await page.goto("./");
  await passarDaPorta(page);
  await page.getByTestId("import-file").setInputFiles(ANTIGO);
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Caixa" }).click();
  await expect(page.getByTestId("total-geral")).toContainText("164.476,16");

  await page.getByRole("link", { name: "Mais" }).click();
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("button", { name: "Backup" }).click();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(ATUAL);
  await expect(page.getByText(/Mesclado pelo id/)).toBeVisible({ timeout: 90_000 });

  await page.getByRole("link", { name: "Caixa" }).click();
  await expect(page.getByTestId("total-geral")).toContainText("164.518,86");
  await expect(page.getByTestId("qtd-geral")).toContainText(/6\.?917/);
});
