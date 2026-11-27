import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e-nuvem",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:4174/controle-de-vendas/",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite preview --outDir /tmp/cv-dist-nuvem --port 4174 --host 127.0.0.1",
    url: "http://127.0.0.1:4174/controle-de-vendas/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
