import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

test("a porta pede só o nome e a venda aparece no outro aparelho", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto("./");
  await expect(a.getByTestId("porta-entrada")).toBeVisible();
  await expect(a.getByTestId("porta-nome")).toBeVisible();
  await expect(a.getByTestId("porta-pin")).toHaveCount(0);
  await a.getByTestId("porta-entrar").click();
  await expect(a.getByTestId("porta-erro")).toContainText("nome");

  await a.getByTestId("porta-nome").fill("Rafael");
  await a.getByTestId("porta-entrar").click();
  await expect(a.getByTestId("import-file").or(a.getByTestId("calc-valor"))).toBeVisible({ timeout: 60_000 });
  if (await a.getByRole("button", { name: "Começar do zero" }).isVisible()) {
    await a.getByRole("button", { name: "Começar do zero" }).click();
  }
  await expect(a.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByTestId("status-nuvem")).toBeVisible();

  await a.getByRole("button", { name: "1", exact: true }).click();
  await a.getByRole("button", { name: "0", exact: true }).click();
  await a.getByRole("button", { name: "0", exact: true }).click();
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByText("Rafael").first()).toBeVisible({ timeout: 15_000 });

  await b.goto("./");
  await expect(b.getByTestId("porta-entrada")).toBeVisible();
  await b.getByTestId("porta-nome").fill("Ana");
  await expect(b.getByTestId("porta-pin")).toHaveCount(0);
  await b.getByTestId("porta-entrar").click();
  await expect(b.getByTestId("import-file").or(b.getByTestId("calc-valor"))).toBeVisible({ timeout: 60_000 });
  if (await b.getByRole("button", { name: "Começar do zero" }).isVisible()) {
    await b.getByRole("button", { name: "Começar do zero" }).click();
  }
  await expect(b.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(b.getByTestId("total-hoje")).toContainText("1,00");
  await expect(b.getByText("Rafael").first()).toBeVisible({ timeout: 20_000 });

  await b.getByRole("button", { name: "2", exact: true }).click();
  await b.getByRole("button", { name: "0", exact: true }).click();
  await b.getByRole("button", { name: "0", exact: true }).click();
  const tBA = Date.now();
  await b.getByTestId("registrar-venda").click();
  await expect(b.getByTestId("total-hoje")).toContainText("3,00", { timeout: 15_000 });
  await a.bringToFront();
  await expect(a.getByTestId("total-hoje")).toContainText("3,00", { timeout: 15_000 });
  await expect(a.getByText("Ana").first()).toBeVisible({ timeout: 15_000 });
  const latenciaBA = Date.now() - tBA;

  await a.locator(".calc-grid .btn", { hasText: /^9$/ }).click();
  await a.locator(".calc-grid .btn", { hasText: /^0$/ }).click();
  await a.locator(".calc-grid .btn", { hasText: /^0$/ }).click();
  const tAB = Date.now();
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("confirmacao-venda")).toBeVisible();
  await expect(b.getByText("9,00").first()).toBeVisible({ timeout: 15_000 });
  const latenciaAB = Date.now() - tAB;
  writeFileSync("/tmp/sync-latencia-ab.json", JSON.stringify({
    latenciaABMs: latenciaAB,
    latenciaBAMs: latenciaBA,
    em: new Date().toISOString(),
  }, null, 2));
  expect(latenciaAB, `A→B ${latenciaAB}ms`).toBeLessThan(10_000);

  await ctxA.setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event("offline")));
  await a.locator(".calc-grid .btn", { hasText: /^8$/ }).click();
  await a.locator(".calc-grid .btn", { hasText: /^0$/ }).click();
  await a.locator(".calc-grid .btn", { hasText: /^0$/ }).click();
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("confirmacao-venda")).toBeVisible();
  await expect(a.getByText("8,00").first()).toBeVisible();
  await ctxA.setOffline(false);
  await a.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(a.getByTestId("status-nuvem")).not.toHaveAttribute("data-status", "offline", { timeout: 15_000 });
  await expect(a.getByTestId("status-nuvem")).not.toHaveAttribute("data-status", "erro", { timeout: 20_000 });
  await expect(b.getByText("8,00").first()).toBeVisible({ timeout: 15_000 });

  await a.getByRole("link", { name: "Mais" }).click();
  await a.locator('a[href$="/equipe"]').click();
  await expect(a.getByTestId("lista-equipe")).toContainText("Rafael");
  await expect(a.getByTestId("lista-equipe")).toContainText("Ana");

  await ctxA.close();
  await ctxB.close();
});
