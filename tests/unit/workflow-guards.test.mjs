import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ci = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const notify = fs.readFileSync(new URL("../../.github/workflows/notify-new-events.yml", import.meta.url), "utf8");
const preflight = notify.split("      - name: Check notification configuration\n")[1]?.split("      - name:")[0];
const script = preflight?.split("        run: |\n")[1]?.split("\n").map((line) => line.slice(10)).join("\n");

describe("workflow guards", () => {
  it("pins Chromium CI to a supported Ubuntu release without removing E2E", () => {
    expect(ci).toContain("runs-on: ubuntu-24.04");
    expect(ci).toContain("npx playwright install --with-deps chromium");
    expect(ci).toContain("npm run test:e2e");
    expect(ci).not.toContain("continue-on-error");
  });

  it("checks notification setup only for new events, before installation and delay", () => {
    expect(preflight).toContain("if: steps.events.outputs.count != '0'");
    expect(notify.indexOf("Check notification configuration")).toBeLessThan(notify.indexOf("Install dependencies"));
    expect(notify.indexOf("Check notification configuration")).toBeLessThan(notify.indexOf("Wait before notification"));
  });

  it.each([undefined, "", "  \t\n"])("fails early with an absent or blank webhook: %j", (value) => {
    const env = { ...process.env };
    delete env.EVENT_NOTIFICATION_WEBHOOK_URL;
    if (value !== undefined) env.EVENT_NOTIFICATION_WEBHOOK_URL = value;
    const result = spawnSync("bash", ["-eu", "-c", script], { env, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::EVENT_NOTIFICATION_WEBHOOK_URL nao esta configurado");
  });

  it("passes configured webhooks without printing or transmitting their value", () => {
    const value = "https://example.invalid/private-test-path";
    const result = spawnSync("bash", ["-eu", "-c", script], {
      env: { ...process.env, EVENT_NOTIFICATION_WEBHOOK_URL: value }, encoding: "utf8"
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toBe("");
  });
});
