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

  it("preserva datas civis YYYY-MM-DD sem recuo por timezone", () => {
    const filters = getFilters();
    const readableDate = filters.get("readableDate");
    const eventDateRange = filters.get("eventDateRange");
    const dayNumber = filters.get("dayNumber");

    expect(readableDate("2026-09-16")).toContain("16");
    expect(eventDateRange("2026-09-16", "2026-09-17")).toContain("16");
    expect(eventDateRange("2026-09-16", "2026-09-17")).toContain("17");
    expect(dayNumber("2026-09-16")).toBe("16");
  });

  it("formata datas editoriais no dia UTC sem deslocamento de fuso", () => {
    const filters = getFilters();

    expect(filters.get("readableDate")("2026-09-16")).toBe("16 de set. de 2026");
    expect(filters.get("eventDateRange")("2026-09-16", "2026-09-17")).toBe(
      "16–17 de set. de 2026"
    );
    expect(filters.get("eventDayRange")("2026-09-16", "2026-09-17")).toBe("16–17");
    expect(filters.get("eventDayRange")("2026-09-30", "2026-10-16")).toBe(
      "30/09–16/10"
    );
    expect(filters.get("eventSpansMonths")("2026-09-30", "2026-10-16")).toBe(true);
    expect(filters.get("dayNumber")("2026-09-16")).toBe("16");
  });

  it("mantem acentos nos rotulos de estado e formato", () => {
    const filters = getFilters();

    expect(filters.get("stateName")("CE")).toBe("Ceará");
    expect(filters.get("stateName")("PI")).toBe("Piauí");
    expect(filters.get("kindLabel")("conference")).toBe("Conferência");
    expect(filters.get("formatLabel")("hybrid")).toBe("Híbrido");
    expect(filters.get("tagLabel")("inovacao")).toBe("Inovação");
    expect(filters.get("tagLabel")("open-source")).toBe("Open source");
    expect(filters.get("tagLabel")("ia")).toBe("IA");
  });
});
