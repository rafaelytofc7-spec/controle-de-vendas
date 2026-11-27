import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4174/", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "python3 -m http.server 4174 --bind 127.0.0.1 --directory /tmp/cv3-e2e", url: "http://127.0.0.1:4174/", reuseExistingServer: false, timeout: 60_000 },
    { command: "python3 -m http.server 4175 --bind 127.0.0.1 --directory /tmp/cv3-e2e-pc", url: "http://127.0.0.1:4175/", reuseExistingServer: false, timeout: 60_000 },
  ],
});
