import { test, expect } from "@playwright/test";
import { passarDaPorta } from "./helpers";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PUBLICO = resolve("docs");
const PRIVADO = resolve("/workspace/controle-vendas/screenshots");

test.use({ viewport: { width: 390, height: 920 } });

async function semear(page: import("@playwright/test").Page, nomeLoja: string) {
  await page.evaluate(async (nome) => {
    const agora = new Date();
    const iso = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}-03:00`;
    };
    const recente = iso(new Date(agora.getTime() - 30_000));
    const antigo = iso(new Date(agora.getTime() - 10 * 60_000));
    const hojeManha = iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 9, 15, 0));
    const hojeTarde = iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 14, 40, 0));
    const atrasada = iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, 12, 0, 0));
    const amanha = iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 14, 40, 0));
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("controle-de-vendas");
      req.onerror = () => reject(req.error ?? new Error("idb"));
      req.onsuccess = () => {
        const db = req.result;
        const lojas = ["configuracao", "membros", "vendas", "encomendas"] as const;
        const tx = db.transaction(lojas as unknown as string[], "readwrite");
        const cfgStore = tx.objectStore("configuracao");
        const getAll = cfgStore.getAll();
        getAll.onsuccess = () => {
          const lista = getAll.result as Array<{ loja: string; nome_loja?: string }>;
          const loja = lista[0]?.loja ?? "loja";
          for (const c of lista) {
            c.nome_loja = nome;
            cfgStore.put(c);
          }
          if (lista.length === 0) {
            cfgStore.put({ loja, nome_loja: nome, telefone: "", mensagem_cardapio: "", taxa_entrega: 0, observacoes: "", atualizado_em: iso(agora) });
          }
          const mem = tx.objectStore("membros");
          mem.put({ uid: "u-rafael", nome: "Rafael", papel: "lider", bloqueado: false, ultimoAcesso: recente, criado_em: hojeManha });
          mem.put({ uid: "u-ana", nome: "Ana", papel: "membro", bloqueado: false, ultimoAcesso: antigo, criado_em: hojeManha });
          const vendas = tx.objectStore("vendas");
          vendas.put({ id: "s1", loja, valor: 25, criado_em: hojeManha, atualizado_em: hojeManha, criadoPor: "u-rafael", atualizadoPor: "u-rafael", criadoPorEmail: "Rafael" });
          vendas.put({ id: "s2", loja, valor: 18.5, criado_em: hojeTarde, atualizado_em: hojeTarde, criadoPor: "u-ana", atualizadoPor: "u-ana", criadoPorEmail: "Ana" });
          vendas.put({ id: "s3", loja, valor: 12, criado_em: hojeManha, atualizado_em: hojeManha, criadoPor: "importado", atualizadoPor: "importado" });
          const enc = tx.objectStore("encomendas");
          enc.put({
            id: "e1", loja, cliente: "Maria", produto: "Cesta de legumes", valor: 40, pago: false,
            forma_pagamento: "pix", valor_pago: null, pago_em: null, pago_por: null, pago_por_nome: null,
            endereco: null, endereco_detalhe: null, telefone: "38999990000", para_entrega: false,
            tipo: "retirada", data_entrega: atrasada, prazo_lembrete: atrasada, status: "pendente",
            entregue_por: null, entregue_por_nome: null, criado_em: atrasada, concluido_em: null,
            atualizado_em: atrasada, criadoPor: "u-rafael", atualizadoPor: "u-rafael",
          });
          enc.put({
            id: "e2", loja, cliente: "João", produto: "Frutas", valor: 22, pago: true,
            forma_pagamento: "dinheiro", valor_pago: 22, pago_em: hojeManha, pago_por: "u-ana", pago_por_nome: "Ana",
            endereco: "Rua das Flores, 10", endereco_detalhe: { rua: "Rua das Flores", numero: "10", bairro: "Centro", referencia: "Portão verde" },
            telefone: "38988880000", para_entrega: true, tipo: "entrega", data_entrega: amanha,
            prazo_lembrete: amanha, status: "pendente", entregue_por: null, entregue_por_nome: null,
            criado_em: hojeManha, concluido_em: null, atualizado_em: hojeManha, criadoPor: "u-ana", atualizadoPor: "u-ana",
          });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
      };
    });
  }, nomeLoja);
  await page.goto("./");
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".header .sub").first()).toHaveText(nomeLoja);
}

test("captura telas públicas com nome genérico e uma captura privada da marca", async ({ page }) => {
  test.skip(process.env.SHOTS !== "1", "somente com SHOTS=1");
  test.setTimeout(180_000);
  mkdirSync(PUBLICO, { recursive: true });
  mkdirSync(PRIVADO, { recursive: true });

  await page.goto("./");
  await expect(page.getByTestId("porta-entrada")).toBeVisible();
  await expect(page.locator(".header .sub").first()).toHaveText("Minha loja");
  await page.screenshot({ path: `${PUBLICO}/00-entrada.png`, fullPage: false });
  await passarDaPorta(page);
  await page.getByRole("button", { name: "Começar do zero" }).click();
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
  await semear(page, "Minha loja");

  await page.screenshot({ path: `${PUBLICO}/01-inicio.png`, fullPage: false });

  await page.getByRole("link", { name: "Caixa" }).click();
  await expect(page.getByTestId("vendas-do-dia")).toBeVisible();
  await page.getByTestId("vendas-do-dia").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("autor-venda").first()).toBeVisible();
  await page.screenshot({ path: `${PUBLICO}/02-vendas.png`, fullPage: false });

  await page.getByRole("link", { name: "Mais" }).click();
  await page.locator('a[href$="/equipe"]').click();
  await expect(page.getByTestId("lista-equipe")).toBeVisible();
  await expect(page.getByText("Online agora").first()).toBeVisible();
  await page.screenshot({ path: `${PUBLICO}/03-equipe.png`, fullPage: false });

  await page.getByRole("link", { name: "Mais" }).click();
  await page.getByRole("link", { name: "Encomendas" }).click();
  await expect(page.getByTestId("lista-encomendas")).toBeVisible();
  await page.screenshot({ path: `${PUBLICO}/04-encomendas.png`, fullPage: false });

  const nomeMarca = process.env.SHOTS_NOME_MARCA?.trim();
  if (nomeMarca) {
    await page.getByRole("link", { name: "Venda" }).click();
    await expect(page.getByTestId("calc-valor")).toBeVisible();
    await page.evaluate((nome) => {
      document.querySelectorAll(".header .sub").forEach((el) => { (el as HTMLElement).textContent = nome; });
    }, nomeMarca);
    await expect(page.locator(".header .sub").first()).toHaveText(nomeMarca);
    await page.screenshot({ path: `${PRIVADO}/marca-inicio.png`, fullPage: false });
  }
});
