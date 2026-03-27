const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "output/playwright/report"
      }
    ]
  ],
  outputDir: "output/playwright/artifacts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium"
      }
    }
  ],
  webServer: {
    command: "npx --no-install serve _site -l 4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: "http://127.0.0.1:4173"
  }
});
