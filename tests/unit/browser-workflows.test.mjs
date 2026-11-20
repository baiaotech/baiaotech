import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("browser-backed workflow runtime", () => {
  for (const filename of ["ci.yml", "event-intake.yml"]) {
    it(`${filename} pins a Playwright-supported runner and the project Node version`, () => {
      const workflow = readFileSync(new URL(`../../.github/workflows/${filename}`, import.meta.url), "utf8");
      expect(workflow).toMatch(/^    runs-on: ubuntu-24\.04$/m);
      expect(workflow).not.toMatch(/^\s*runs-on: ubuntu-latest$/m);
      expect(workflow).toMatch(/^          node-version: 24$/m);
      expect(workflow).toContain("npx playwright install --with-deps chromium");
    });
  }
});
