import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const configureEleventy = require("../../.eleventy.js");

function getFilters() {
  const filters = new Map();
  const config = {
    addCollection() {},
    addFilter(name, fn) {
      filters.set(name, fn);
    },
    addPassthroughCopy() {},
    addShortcode() {}
  };

  configureEleventy(config);

  return filters;
}

describe("eleventy config filters", () => {
  it("remove conteudo de script e style mesmo com fechamento espacado", () => {
    const filters = getFilters();
    const plainText = filters.get("plainText");
    const summaryText = filters.get("summaryText");
    const html = `
      <p>Resumo publico</p>
      <script type="application/json">{"token":"nao deve sair"}</script >
      <style>.secret { color: red; }</style >
      <p>Depois</p>
    `;

    expect(plainText(html)).toBe("Resumo publico Depois");
    expect(summaryText(html)).toBe("Resumo publico Depois");
  });
});
