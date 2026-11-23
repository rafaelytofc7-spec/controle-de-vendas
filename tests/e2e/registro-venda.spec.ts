import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { passarDaPorta } from "./helpers";

function zerado(texto: string): boolean {
  return texto.replace(/\u00a0/g, " ").trim() === "R$ 0,00";
}

async function abrirCaixa(page: Page) {
  await page.goto("./");
  await passarDaPorta(page);
  const comecar = page.getByRole("button", { name: "Começar do zero" });
  if (await comecar.isVisible().catch(() => false)) await comecar.click();
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
}

async function digitar10(page: Page) {
  const tecla = (n: string) => page.locator(".calc-grid .btn", { hasText: new RegExp(`^${n}$`) });
  await tecla("1").click();
  await tecla("0").click();
  await tecla("0").click();
  await tecla("0").click();
  await expect(page.getByTestId("calc-valor")).toContainText("10,00");
}

test("um toque confirma a venda na hora e zera o troco", async ({ page }) => {
  await abrirCaixa(page);
  await digitar10(page);
  await page.getByTestId("recebido").fill("20");
  await expect(page.getByTestId("recebido")).toHaveValue("20");

  const t0 = await page.evaluate(() => performance.now());
  await page.getByTestId("registrar-venda").click();
  await expect(page.getByTestId("confirmacao-venda")).toBeVisible();
  const t1 = await page.evaluate(() => performance.now());
  const ms = t1 - t0;

  await expect(page.getByTestId("calc-valor")).toHaveText(/R\$\s*0,00/);
  const visor = (await page.getByTestId("calc-valor").innerText()).replace(/\u00a0/g, " ");
  expect(zerado(visor)).toBe(true);
  await expect(page.getByTestId("total-hoje")).toContainText("10,00");
  await expect(page.getByTestId("recebido")).toHaveValue("");
  writeFileSync("/tmp/registro-venda-apos.json", JSON.stringify({ confirmacaoMs: Number(ms.toFixed(1)) }, null, 2));
  expect(ms).toBeLessThan(400);
});

test("cinco toques em 200ms geram uma só venda", async ({ page }) => {
  await abrirCaixa(page);
  await digitar10(page);
  await page.getByTestId("registrar-venda").evaluate((btn) => {
    for (let i = 0; i < 5; i++) (btn as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("confirmacao-venda")).toBeVisible();
  await expect(page.getByTestId("total-hoje")).toContainText("10,00");
  await expect(page.getByTestId("total-hoje")).not.toContainText("50,00");
  const visor = (await page.getByTestId("calc-valor").innerText()).replace(/\u00a0/g, " ");
  expect(zerado(visor)).toBe(true);
});

test("registra a venda mesmo offline", async ({ page, context }) => {
  await abrirCaixa(page);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await digitar10(page);
  await page.getByTestId("registrar-venda").click();
  await expect(page.getByTestId("confirmacao-venda")).toBeVisible();
  await expect(page.getByTestId("total-hoje")).toContainText("10,00");
  await context.setOffline(false);
});
