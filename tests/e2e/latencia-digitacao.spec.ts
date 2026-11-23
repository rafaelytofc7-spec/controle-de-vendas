import { test, expect } from "@playwright/test";
import { passarDaPorta } from "./helpers";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OFICIAL = resolve("/workspace/controle-vendas/importacao/caixa-importacao-2026-11-21.json");
const FASE = process.env.LATENCIA_FASE ?? "medida";
const SAIDA = resolve(`/tmp/latencia-${FASE}.json`);
const THROTTLE = 6;

test("mede latência ao digitar com CPU 6x mais lenta", async ({ page }) => {
  test.skip(!existsSync(OFICIAL), "arquivo de importação privada ausente");
  test.setTimeout(180_000);

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

  await page.goto("./");
  await passarDaPorta(page);
  await page.getByTestId("import-file").setInputFiles(OFICIAL);
  await expect(page.getByTestId("calc-valor")).toBeVisible({ timeout: 90_000 });

  const custoAgregacao = await page.evaluate(() => {
    const t0 = performance.now();
    const nos = document.querySelectorAll("[data-testid='total-hoje'], [data-testid='calc-valor']");
    void nos.length;
    return performance.now() - t0;
  });

  const recebido = page.locator('label.field:has-text("Recebido") input, [data-testid="recebido"]');
  await recebido.click();
  await recebido.fill("");

  const digitacao = await page.evaluate(async () => {
    const el = document.querySelector('label.field input.num, [data-testid="recebido"]') as HTMLInputElement | null;
    if (!el) return { erro: "campo recebido não encontrado", amostras: [] as number[] };
    el.focus();
    const amostras: number[] = [];
    const texto = "12345";
    for (const ch of texto) {
      const inicio = performance.now();
      el.value = (el.value || "") + ch;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      amostras.push(performance.now() - inicio);
    }
    return { erro: null, amostras };
  });

  // also measure physical-ish typing via Playwright press
  await recebido.fill("");
  const pressAmostras: number[] = [];
  for (const ch of "678") {
    const t0 = await page.evaluate(() => performance.now());
    await recebido.press(ch);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const t1 = await page.evaluate(() => performance.now());
    pressAmostras.push(t1 - t0);
  }

  const botoes: number[] = [];
  await page.getByRole("button", { name: "Limpar" }).click();
  for (const n of ["1", "2", "5"]) {
    const t0 = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: n, exact: true }).click();
    await expect(page.getByTestId("calc-valor")).not.toHaveText("R$ 0,00");
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const t1 = await page.evaluate(() => performance.now());
    botoes.push(t1 - t0);
  }

  const media = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const p95 = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
  };

  const relatorio = {
    fase: FASE,
    throttle: THROTTLE,
    em: new Date().toISOString(),
    custoAgregacaoMs: custoAgregacao,
    inputDispatch: {
      amostras: digitacao.amostras,
      mediaMs: media(digitacao.amostras),
      p95Ms: p95(digitacao.amostras),
      maxMs: Math.max(0, ...digitacao.amostras),
      erro: digitacao.erro,
    },
    inputPress: {
      amostras: pressAmostras,
      mediaMs: media(pressAmostras),
      p95Ms: p95(pressAmostras),
      maxMs: Math.max(0, ...pressAmostras),
    },
    botoesCalc: {
      amostras: botoes,
      mediaMs: media(botoes),
      p95Ms: p95(botoes),
      maxMs: Math.max(0, ...botoes),
    },
  };
  writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2));
  console.log(JSON.stringify(relatorio, null, 2));
  expect(digitacao.erro).toBeNull();
});
