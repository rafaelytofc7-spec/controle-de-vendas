import { test, expect, type Page } from "@playwright/test";
import { passarDaPorta } from "./helpers";

const LARGURAS = [320, 360, 390, 412, 480] as const;

type Vazamento = {
  docOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  els: Array<{ tag: string; cls: string; testid: string | null; right: number; left: number; w: number }>;
};

async function preparar(page: Page) {
  await page.goto("./");
  await passarDaPorta(page);
  const comecar = page.getByRole("button", { name: "Começar do zero" });
  if (await comecar.isVisible()) await comecar.click();
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 30_000 });
}

async function medir(page: Page): Promise<Vazamento> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const els: Vazamento["els"] = [];
    for (const el of document.querySelectorAll("body *")) {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > w + 2 || r.left < -2) {
        els.push({
          tag: el.tagName,
          cls: String((el as HTMLElement).className ?? "").slice(0, 80),
          testid: el.getAttribute("data-testid"),
          right: Math.round(r.right),
          left: Math.round(r.left),
          w,
        });
      }
    }
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      docOverflow: scrollWidth > w + 2,
      scrollWidth,
      clientWidth: w,
      els: els.slice(0, 25),
    };
  });
}

async function afirmarSemVazamento(page: Page, rotulo: string) {
  const r = await medir(page);
  expect(r, rotulo).toEqual(expect.objectContaining({ docOverflow: false, els: [] }));
}

async function abrirEncomendaDeExemplo(page: Page) {
  await page.getByRole("link", { name: "Mais" }).click();
  await page.getByRole("link", { name: "Encomendas" }).click();
  await expect(page.getByTestId("lista-encomendas")).toBeVisible();
  if (await page.getByTestId("lista-encomendas").locator(".card-encomenda, .item").count() === 0) {
    await page.getByRole("button", { name: "Nova encomenda" }).click();
    await page.getByLabel("Cliente", { exact: true }).fill("Maria");
    await page.getByLabel("Produto", { exact: true }).fill("Cesta");
    await page.getByLabel("Valor", { exact: true }).fill("25");
    await page.getByLabel("Telefone / WhatsApp do cliente").fill("38999999999");
    await page.getByLabel("Tipo").selectOption("entrega");
    await page.getByLabel("Rua").fill("Rua das Flores");
    await page.getByLabel("Número").fill("10");
    await page.getByLabel("Bairro").fill("Centro");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByTestId("lista-encomendas").locator(".card-encomenda, .item")).toHaveCount(1, { timeout: 10_000 });
  }
}

test.describe("o app cabe na tela em vários tamanhos", () => {
  for (const w of LARGURAS) {
    test(`não vaza na horizontal em ${w}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: w, height: 800 });
      await preparar(page);
      await afirmarSemVazamento(page, `venda ${w}`);

      await page.getByTestId("ler-codigo-venda").click();
      await expect(page.getByTestId("leitor-overlay")).toBeVisible();
      await afirmarSemVazamento(page, `leitor ${w}`);
      await page.getByRole("button", { name: "Cancelar" }).click();

      await page.getByRole("link", { name: "Cardápio" }).click();
      await page.getByRole("button", { name: "Novo" }).click();
      await page.getByLabel("Unidade").fill("un");
      await expect(page.getByTestId("ler-codigo-produto")).toBeVisible();
      await afirmarSemVazamento(page, `cardápio form ${w}`);
      await page.getByRole("button", { name: "Cancelar" }).click();

      await abrirEncomendaDeExemplo(page);
      await afirmarSemVazamento(page, `encomendas lista ${w}`);
      await page.getByRole("button", { name: "Nova encomenda" }).click();
      await expect(page.getByLabel("Cliente", { exact: true })).toBeVisible();
      await page.getByLabel("Tipo").selectOption("entrega");
      await afirmarSemVazamento(page, `encomendas form ${w}`);
      await page.locator(".dialog-encomenda").getByRole("button", { name: "Cancelar" }).click();

      await page.getByRole("link", { name: "Caixa" }).click();
      await afirmarSemVazamento(page, `caixa ${w}`);
      await page.getByRole("link", { name: "Mais" }).click();
      await afirmarSemVazamento(page, `mais ${w}`);
    });
  }

  test("não vaza no celular deitado", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 800, height: 360 });
    await preparar(page);
    await afirmarSemVazamento(page, "venda landscape");
    await abrirEncomendaDeExemplo(page);
    await afirmarSemVazamento(page, "encomendas landscape");
    await page.getByRole("button", { name: "Nova encomenda" }).click();
    await expect(page.getByLabel("Cliente", { exact: true })).toBeVisible();
    await afirmarSemVazamento(page, "form landscape");
  });

  test("não vaza no tablet em ~800px", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 800, height: 1280 });
    await preparar(page);
    await afirmarSemVazamento(page, "venda tablet");
    await abrirEncomendaDeExemplo(page);
    await afirmarSemVazamento(page, "encomendas tablet");
    await page.getByRole("button", { name: "Nova encomenda" }).click();
    await expect(page.getByLabel("Cliente", { exact: true })).toBeVisible();
    await afirmarSemVazamento(page, "form tablet");
  });
});
