import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

// A loja de teste é semeada como a principal: já tem histórico e não tem Admin (lider_uid nulo).
// O histórico semeado tem uma venda de hoje de R$ 5,00.

async function digitar(p: Page, digitos: string) {
  for (const d of digitos) await p.locator(".calc-grid .btn", { hasText: new RegExp(`^${d}$`) }).click();
}

test("abre direto na venda, entra sozinho e a venda aparece no outro aparelho", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto("./");
  await expect(a.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByTestId("porta-entrada")).toHaveCount(0);
  await expect(a.getByTestId("import-file")).toHaveCount(0);
  // Baixou o histórico da loja (venda semeada de hoje).
  await expect(a.getByTestId("total-hoje")).toContainText("5,00", { timeout: 45_000 });

  await digitar(a, "100");
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("total-hoje")).toContainText("6,00", { timeout: 15_000 });

  await b.goto("./");
  await expect(b.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(b.getByTestId("porta-entrada")).toHaveCount(0);
  await expect(b.getByTestId("total-hoje")).toContainText("6,00", { timeout: 45_000 });

  await digitar(b, "200");
  const tBA = Date.now();
  await b.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("total-hoje")).toContainText("8,00", { timeout: 15_000 });
  const latenciaBA = Date.now() - tBA;

  await digitar(a, "900");
  const tAB = Date.now();
  await a.getByTestId("registrar-venda").click();
  await expect(b.getByTestId("total-hoje")).toContainText("17,00", { timeout: 15_000 });
  const latenciaAB = Date.now() - tAB;
  writeFileSync("/tmp/sync-latencia-ab.json", JSON.stringify({ latenciaABMs: latenciaAB, latenciaBAMs: latenciaBA, em: new Date().toISOString() }, null, 2));

  // Offline: registra mesmo assim e envia quando volta.
  await ctxA.setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event("offline")));
  await digitar(a, "800");
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("total-hoje")).toContainText("25,00");
  await ctxA.setOffline(false);
  await a.evaluate(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(b.getByTestId("total-hoje")).toContainText("25,00", { timeout: 20_000 });

  // Toque rápido = 1 venda.
  await digitar(a, "1000");
  await a.getByTestId("registrar-venda").evaluate((btn) => { for (let i = 0; i < 5; i++) (btn as HTMLButtonElement).click(); });
  await expect(a.getByTestId("total-hoje")).toContainText("35,00");
  await expect(b.getByTestId("total-hoje")).toContainText("35,00", { timeout: 15_000 });

  await ctxA.close();
  await ctxB.close();
});
