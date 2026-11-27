import { test, expect, type Page } from "@playwright/test";
import { appendFileSync, writeFileSync } from "node:fs";

const RT = 2_000;
const PROGRESSO = "/tmp/e2e-progress.log";

function progresso(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(PROGRESSO, line + "\n");
}

async function digitar(p: Page, digitos: string) {
  for (const d of digitos) await p.locator(".calc-grid .btn", { hasText: new RegExp(`^${d}$`) }).click();
}

async function abrirDireto(p: Page) {
  p.on("pageerror", (err) => progresso(`pageerror ${p.url()} ${err.message}`));
  p.on("console", (msg) => {
    if (msg.type() === "error") progresso(`console.error ${msg.text()}`);
  });
  await p.goto("./", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(p.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(p.getByTestId("porta-entrada")).toHaveCount(0);
}

async function limparSessaoPreservandoFila(p: Page) {
  await p.evaluate(async () => {
    for (const k of Object.keys(localStorage)) {
      if (/supabase|sb-|auth-token/i.test(k)) localStorage.removeItem(k);
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("controle-vendas-auth");
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction("kv", "readwrite");
        const store = tx.objectStore("kv");
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          for (const key of keys.result) {
            if (String(key) !== "aparelho_id") store.delete(key);
          }
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
    });
  });
}

test("sincroniza em tempo real, envia ao reconectar e recupera ao voltar ao app", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  writeFileSync(PROGRESSO, "");
  progresso("abre A");
  await abrirDireto(a);
  await expect(a.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 45_000 });
  progresso("A sincronizado");

  progresso("abre B");
  await abrirDireto(b);
  await expect(b.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 20_000 });
  progresso("B sincronizado");

  // Primeira venda A→B < 2 s (também deixa o histórico visível para o outro membro)
  await a.bringToFront();
  await digitar(a, "500");
  await expect(a.getByTestId("calc-valor")).toContainText("5,00");
  const tSeed = Date.now();
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("total-hoje")).toContainText("5,00", { timeout: 10_000 });
  await expect(b.getByTestId("total-hoje")).toContainText("5,00", { timeout: RT });
  const latenciaSeed = Date.now() - tSeed;
  progresso(`primeira venda ok ${latenciaSeed}ms`);
  // Cinco toques no registrar com o visor zerado não criam vendas a mais
  for (let i = 0; i < 5; i++) await a.getByTestId("registrar-venda").click({ force: true });
  await expect(a.getByTestId("total-hoje")).toContainText("5,00");

  // Histórico visível para um membro novo
  progresso("abre C");
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  await abrirDireto(c);
  progresso(`C aberto status=${await c.getByTestId("status-nuvem").innerText().catch(() => "?")}`);
  await expect(c.getByTestId("total-hoje")).toContainText("5,00", { timeout: 45_000 });
  await expect(c.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 45_000 });
  progresso("C viu historico");
  await ctxC.close();
  progresso("C fechado");

  // Venda nova A→B < 2 s
  await a.bringToFront();
  await digitar(a, "100");
  await expect(a.getByTestId("calc-valor")).toContainText("1,00");
  const tNova = Date.now();
  await a.getByTestId("registrar-venda").click();
  await expect(b.getByTestId("total-hoje")).toContainText("6,00", { timeout: RT });
  const latenciaNova = Date.now() - tNova;
  progresso(`venda +1 ok ${latenciaNova}ms`);

  // Excluir venda A→B < 2 s
  await a.getByTestId("venda-hoje-1").getByLabel("Excluir venda").click();
  await a.getByTestId("dialogo-confirmar").click();
  const tDel = Date.now();
  await expect(b.getByTestId("total-hoje")).toContainText("5,00", { timeout: RT });
  const latenciaDel = Date.now() - tDel;
  progresso(`delete venda ok ${latenciaDel}ms`);

  // Produto novo / editado / excluído (B já está no cardápio para medir só a latência)
  await b.getByRole("link", { name: "Cardápio" }).click();
  await expect(b.getByTestId("novo-produto")).toBeVisible();
  await a.getByRole("link", { name: "Cardápio" }).click();
  await a.getByTestId("novo-produto").click();
  await a.getByTestId("produto-nome").fill("Tomate teste");
  await a.getByTestId("produto-preco").fill("3,50");
  await a.getByLabel("Unidade").fill("un");
  await a.getByTestId("produto-salvar").evaluate((el) => (el as HTMLButtonElement).click());
  await expect(a.getByTestId("produto-item-Tomate teste")).toBeVisible({ timeout: 10_000 });
  const tProd = Date.now();
  await expect(b.getByTestId("produto-item-Tomate teste")).toBeVisible({ timeout: RT });
  await expect(b.getByTestId("produto-item-Tomate teste")).toContainText("3,50");
  const latenciaProd = Date.now() - tProd;
  progresso(`produto novo ok ${latenciaProd}ms`);

  await a.getByTestId("produto-item-Tomate teste").getByRole("button", { name: "Editar" }).click();
  await expect(a.getByTestId("produto-preco")).toBeVisible();
  await expect(a.getByTestId("produto-preco")).toHaveValue("3,50");
  await a.getByTestId("produto-preco").fill("4,00");
  await expect(a.getByTestId("produto-preco")).toHaveValue("4,00");
  progresso(`antes de salvar edit disabled=${await a.getByTestId("produto-salvar").isDisabled()} valor=${await a.getByTestId("produto-preco").inputValue()}`);
  await a.getByTestId("produto-salvar").evaluate((el) => (el as HTMLButtonElement).click());
  await expect(a.getByTestId("produto-preco")).toHaveCount(0, { timeout: 10_000 });
  await expect(a.getByTestId("produto-item-Tomate teste")).toContainText("4,00", { timeout: 10_000 });
  const tEdit = Date.now();
  await expect(b.getByTestId("produto-item-Tomate teste")).toContainText("4,00", { timeout: RT });
  const latenciaEdit = Date.now() - tEdit;
  progresso(`produto edit ok ${latenciaEdit}ms`);

  await a.getByTestId("produto-item-Tomate teste").getByRole("button", { name: "Editar" }).click();
  await expect(a.getByTestId("produto-excluir")).toBeVisible();
  await a.getByTestId("produto-excluir").click();
  await a.getByTestId("dialogo-confirmar").click();
  const tExclProd = Date.now();
  await expect(b.getByTestId("produto-item-Tomate teste")).toHaveCount(0, { timeout: RT });
  const latenciaExclProd = Date.now() - tExclProd;
  progresso(`produto delete ok ${latenciaExclProd}ms`);

  await a.getByRole("link", { name: "Venda" }).click();
  await expect(a.getByTestId("calc-valor")).toBeVisible({ timeout: 15_000 });
  await b.goto("./");
  await expect(b.getByTestId("calc-valor")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 20_000 });

  // Offline → reconecta e envia
  await ctxA.setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event("offline")));
  await a.bringToFront();
  await digitar(a, "200");
  await expect(a.getByTestId("calc-valor")).toContainText("2,00");
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
  progresso("offline reconectou");
  await expect(a.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 20_000 });

  // Segundo plano / retomada: B registra enquanto A está oculta; ao voltar, A alcança.
  await a.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await b.bringToFront();
  await digitar(b, "300");
  await expect(b.getByTestId("calc-valor")).toContainText("3,00");
  await b.getByTestId("registrar-venda").click();
  await expect(b.getByTestId("total-hoje")).toContainText("10,00", { timeout: 15_000 });
  await a.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(a.getByTestId("total-hoje")).toContainText("10,00", { timeout: 5_000 });
  progresso("resume ok");

  // Reinstalação com fila pendente: perde a sessão, conserva vendas e aparelho_id, reenvia ao entrar.
  await ctxA.setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event("offline")));
  await a.bringToFront();
  await digitar(a, "400");
  await expect(a.getByTestId("calc-valor")).toContainText("4,00");
  await a.getByTestId("registrar-venda").click();
  await expect(a.getByTestId("total-hoje")).toContainText("14,00");
  await expect(a.getByTestId("status-nuvem")).toContainText("aguardando");
  await limparSessaoPreservandoFila(a);
  await ctxA.setOffline(false);
  await a.goto("./");
  await expect(a.getByTestId("status-nuvem")).toContainText("Online, sincronizado", { timeout: 45_000 });
  await expect(a.getByTestId("total-hoje")).toContainText("14,00", { timeout: 20_000 });
  await expect(b.getByTestId("total-hoje")).toContainText("14,00", { timeout: 20_000 });
  progresso("reinstall fila ok");

  writeFileSync("/tmp/sync-latencia-ab.json", JSON.stringify({
    latenciaPrimeiraMs: latenciaSeed,
    latenciaNovaMs: latenciaNova,
    latenciaDelMs: latenciaDel,
    latenciaProdMs: latenciaProd,
    latenciaEditMs: latenciaEdit,
    latenciaExclProdMs: latenciaExclProd,
    em: new Date().toISOString(),
  }, null, 2));

  await ctxA.close();
  await ctxB.close();
});
