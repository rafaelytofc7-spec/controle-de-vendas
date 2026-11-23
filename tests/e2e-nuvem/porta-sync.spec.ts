import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

const RT = 2_000;

async function digitar(p: Page, digitos: string) {
  for (const d of digitos) await p.locator(".calc-grid .btn", { hasText: new RegExp(`^${d}$`) }).click();
}

async function abrirDireto(p: Page) {
  await p.goto("./");
  await expect(p.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(p.getByTestId("porta-entrada")).toHaveCount(0);
}

test("sincroniza em tempo real, envia ao reconectar e recupera ao voltar ao app", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await abrirDireto(a);
  await expect(a.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 45_000 });
  await expect(a.getByTestId("total-hoje")).toContainText("5,00", { timeout: 45_000 });

  await abrirDireto(b);
  await expect(b.getByTestId("total-hoje")).toContainText("5,00", { timeout: 45_000 });
  await expect(b.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 20_000 });

  // Venda nova A→B < 2 s
  await digitar(a, "100");
  const tNova = Date.now();
  await a.getByTestId("registrar-venda").click();
  await expect(b.getByTestId("total-hoje")).toContainText("6,00", { timeout: RT });
  const latenciaNova = Date.now() - tNova;

  // Excluir venda A→B < 2 s
  await a.getByTestId("venda-hoje-1").getByLabel("Excluir venda").click();
  await a.getByTestId("dialogo-confirmar").click();
  const tDel = Date.now();
  await expect(b.getByTestId("total-hoje")).toContainText("5,00", { timeout: RT });
  const latenciaDel = Date.now() - tDel;

  // Produto novo / editado / excluído (B já está no cardápio para medir só a latência)
  await b.getByRole("link", { name: "Cardápio" }).click();
  await expect(b.getByTestId("novo-produto")).toBeVisible();
  await a.getByRole("link", { name: "Cardápio" }).click();
  await a.getByTestId("novo-produto").click();
  await a.getByTestId("produto-nome").fill("Tomate teste");
  await a.getByTestId("produto-preco").fill("3,50");
  await a.getByLabel("Unidade").fill("un");
  await a.getByTestId("produto-salvar").click();
  await expect(a.getByTestId("produto-item-Tomate teste")).toBeVisible({ timeout: 10_000 });
  const tProd = Date.now();
  await expect(b.getByTestId("produto-item-Tomate teste")).toBeVisible({ timeout: RT });
  await expect(b.getByTestId("produto-item-Tomate teste")).toContainText("3,50");
  const latenciaProd = Date.now() - tProd;

  await a.getByTestId("produto-item-Tomate teste").getByRole("button", { name: "Editar" }).click();
  await expect(a.getByTestId("produto-excluir")).toBeVisible();
  await a.getByTestId("produto-excluir").click();
  await a.getByTestId("dialogo-confirmar").click();
  const tExclProd = Date.now();
  await expect(b.getByTestId("produto-item-Tomate teste")).toHaveCount(0, { timeout: RT });
  const latenciaExclProd = Date.now() - tExclProd;

  await a.getByRole("link", { name: "Venda" }).click();
  await expect(a.getByTestId("calc-valor")).toBeVisible({ timeout: 15_000 });
  await b.goto("./");
  await expect(b.getByTestId("calc-valor")).toBeVisible({ timeout: 15_000 });

  // Offline → reconecta e envia
  await ctxA.setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event("offline")));
  await digitar(a, "200");
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("total-hoje")).toContainText("7,00");
  await expect(a.getByTestId("status-nuvem")).toContainText("Offline");
  await expect(a.getByTestId("status-nuvem")).toContainText("aguardando");
  await ctxA.setOffline(false);
  await a.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(b.getByTestId("total-hoje")).toContainText("7,00", { timeout: 20_000 });
  await expect(a.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 20_000 });

  // Segundo plano / retomada: B registra enquanto A está oculta; ao voltar, A alcança.
  await a.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await b.bringToFront();
  await digitar(b, "300");
  await b.getByTestId("registrar-venda").click();
  await expect(b.getByTestId("total-hoje")).toContainText("10,00", { timeout: 15_000 });
  await a.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(a.getByTestId("total-hoje")).toContainText("10,00", { timeout: 5_000 });

  writeFileSync("/tmp/sync-latencia-ab.json", JSON.stringify({
    latenciaNovaMs: latenciaNova,
    latenciaDelMs: latenciaDel,
    latenciaProdMs: latenciaProd,
    latenciaExclProdMs: latenciaExclProd,
    em: new Date().toISOString(),
  }, null, 2));

  await ctxA.close();
  await ctxB.close();
});
