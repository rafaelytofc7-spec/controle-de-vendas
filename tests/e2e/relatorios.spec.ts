import { test, expect } from "@playwright/test";
import { passarDaPorta } from "./helpers";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ATUAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21-1958.json");

test("mostra o total de cada mês e o total geral", async ({ page }) => {
  test.skip(!existsSync(ATUAL), "arquivo de atualização ausente");
  test.setTimeout(120_000);
  await page.goto("./");
  await passarDaPorta(page);
  await page.getByTestId("import-file").setInputFiles(ATUAL);
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Mais" }).click();
  await page.getByRole("link", { name: "Relatórios" }).click();
  await expect(page.getByTestId("relatorios")).toBeVisible();
  await expect(page.getByTestId("total-periodo")).toContainText("164.518,86");
  await expect(page.getByTestId("mes-2026-08")).toContainText("13.132,97");
  await expect(page.getByTestId("mes-2026-09")).toContainText("56.617,12");
  await expect(page.getByTestId("mes-2026-10")).toContainText("51.575,46");
  await expect(page.getByTestId("mes-2026-11")).toContainText("43.193,31");
  await page.getByTestId("mes-2026-11").click();
  await expect(page.getByTestId("relatorio-mes")).toBeVisible();
  await expect(page.getByTestId("total-mes")).toContainText("43.193,31");
});
