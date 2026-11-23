import { expect, type Page } from "@playwright/test";

/** Marks this device as already in the store so local e2e can skip the PIN gate. */
export async function passarDaPorta(page: Page): Promise<void> {
  const porta = page.getByTestId("porta-entrada");
  await expect(porta.or(page.getByTestId("import-file")).or(page.getByTestId("calc-valor"))).toBeVisible({ timeout: 20_000 });
  if (!(await porta.isVisible())) return;
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("controle-de-vendas");
      req.onerror = () => reject(req.error ?? new Error("idb"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction("meta", "readwrite");
        tx.objectStore("meta").put({
          chave: "equipe",
          valor: { ehDono: true, ehLider: true, bloqueado: false, liderUid: "local-e2e", meuNome: "Teste" },
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
      };
    });
  });
  await page.reload();
  await expect(page.getByTestId("import-file").or(page.getByTestId("calc-valor"))).toBeVisible({ timeout: 20_000 });
}
