// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadModule() {
  window.__BAIAOTECH_DISABLE_AUTOBOOT__ = true;
  delete require.cache[require.resolve("../../src/assets/js/list-filters.js")];
  return require("../../src/assets/js/list-filters.js");
}

function buildDom() {
  document.body.innerHTML = `
    <div data-list-root>
      <button type="button" data-filter-toggle aria-expanded="false">Abrir</button>
      <div data-filter-panel></div>
      <button type="button" data-filter-close>Fechar</button>
      <div data-filter-backdrop hidden></div>
      <div data-filter-status hidden>
        <div data-filter-chips></div>
        <button type="button" data-filter-reset>Limpar filtros ativos</button>
      </div>
      <form data-filter-form>
        <input data-filter-search value="" />
        <select data-filter-key="state">
          <option value="">Todos</option>
          <option value="PE">PE</option>
        </select>
        <button type="reset" data-filter-reset>Limpar</button>
      </form>
      <p><span data-results-count>0</span></p>
      <section data-filter-section>
        <p data-section-empty hidden>Vazio</p>
        <article data-card data-searchable="Recife Frontend" data-state="PE"></article>
        <article data-card data-searchable="Salvador Python" data-state="BA"></article>
      </section>
    </div>
  `;

  return document.querySelector("[data-list-root]");
}

describe("list filters", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.className = "";
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
  });

  it("normaliza tokens e listas de dataset", () => {
    const { splitDataset, tokenize } = loadModule();
    expect(tokenize("  Recife Frontend ")).toBe("recife frontend");
    expect(splitDataset("pe, recife ,  ")).toEqual(["pe", "recife"]);
  });

  it("aplica filtros e atualiza contador", () => {
    const { applyFilters } = loadModule();
    const root = buildDom();
    root.querySelector("[data-filter-search]").value = "frontend";

    applyFilters(root);

    const cards = [...root.querySelectorAll("[data-card]")];
    expect(cards[0].hidden).toBe(false);
    expect(cards[1].hidden).toBe(true);
    expect(root.querySelector("[data-results-count]").textContent).toBe("1");
    expect(root.querySelector("[data-filter-status]").hidden).toBe(false);
    expect(root.querySelector("[data-filter-chips]").textContent).toContain("Busca: frontend");
  });

  it("suporta dataset com multiplos valores e lida com estrutura incompleta", () => {
    const { applyFilters, setFilterPanelState } = loadModule();

    document.body.innerHTML = `
      <div data-list-root>
        <button type="button" data-filter-toggle aria-expanded="false">Abrir</button>
        <div data-filter-panel></div>
        <div data-filter-backdrop hidden></div>
        <form data-filter-form>
          <select data-filter-key="tags">
            <option value="">Todos</option>
            <option value="cloud">cloud</option>
          </select>
        </form>
        <p><span data-results-count>0</span></p>
        <section data-filter-section>
          <p data-section-empty hidden>Vazio</p>
          <article data-card data-searchable="Cloud Day" data-tags="cloud, ia"></article>
          <article data-card data-searchable="UX Day" data-tags="ux"></article>
        </section>
      </div>
    `;

    const root = document.querySelector("[data-list-root]");
    root.querySelector("[data-filter-key='tags']").value = "cloud";
    applyFilters(root);

    const cards = [...root.querySelectorAll("[data-card]")];
    expect(cards[0].hidden).toBe(false);
    expect(cards[1].hidden).toBe(true);

    const incompleteRoot = document.createElement("div");
    expect(() => setFilterPanelState(incompleteRoot, true, { document, window })).not.toThrow();
  });

  it("controla o painel e os eventos de interacao", () => {
    const { bindListRoot, setFilterPanelState } = loadModule();
    const root = buildDom();
    const cleanup = bindListRoot(root, { document, window, debounceMs: 0 });
    const toggle = root.querySelector("[data-filter-toggle]");
    const backdrop = root.querySelector("[data-filter-backdrop]");
    const form = root.querySelector("[data-filter-form]");
    const select = root.querySelector("[data-filter-key='state']");
    const search = root.querySelector("[data-filter-search]");

    setFilterPanelState(root, true, { document, window });
    expect(root.classList.contains("filters-open")).toBe(true);
    expect(document.body.classList.contains("has-filter-panel")).toBe(true);
    expect(backdrop.hidden).toBe(false);
    expect(document.activeElement).toBe(search);

    window.innerWidth = 800;
    select.value = "PE";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(root.classList.contains("filters-open")).toBe(false);
    expect(root.querySelector("[data-results-count]").textContent).toBe("1");

    toggle.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root.classList.contains("filters-open")).toBe(false);
    expect(document.activeElement).toBe(toggle);

    toggle.click();
    window.innerWidth = 1200;
    window.dispatchEvent(new Event("resize"));
    expect(root.classList.contains("filters-open")).toBe(false);

    cleanup();
  });

  it("reseta os filtros e recalcula a lista", () => {
    const { bindListRoot } = loadModule();
    const root = buildDom();
    const cleanup = bindListRoot(root, { document, window, debounceMs: 0 });
    const search = root.querySelector("[data-filter-search]");
    const reset = root.querySelector("[data-filter-status] [data-filter-reset]");

    search.value = "frontend";
    root.querySelector("[data-filter-form]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(root.querySelector("[data-results-count]").textContent).toBe("1");
    expect(root.querySelector("[data-filter-status]").hidden).toBe(false);

    reset.click();
    expect(search.value).toBe("");
    expect(root.querySelector("[data-results-count]").textContent).toBe("2");
    expect(root.querySelector("[data-filter-status]").hidden).toBe(true);

    cleanup();
  });

  it("filtra enquanto o usuario digita e muda selects", () => {
    const { bindListRoot } = loadModule();
    const root = buildDom();
    const cleanup = bindListRoot(root, { document, window, debounceMs: 0 });
    const search = root.querySelector("[data-filter-search]");
    const select = root.querySelector("[data-filter-key='state']");

    search.value = "salvador";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector("[data-results-count]").textContent).toBe("1");

    select.value = "PE";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector("[data-results-count]").textContent).toBe("0");
    expect(root.querySelector("[data-section-empty]").hidden).toBe(false);

    cleanup();
  });

  it("inicializa todos os roots disponiveis", () => {
    const { bootListFilters } = loadModule();
    const root = buildDom();
    const cleanups = bootListFilters({ document, window });

    expect(cleanups).toHaveLength(1);
    root.querySelector("[data-filter-toggle]").click();
    expect(root.classList.contains("filters-open")).toBe(true);

    cleanups.forEach((cleanup) => cleanup());
  });

  it("faz autoboot quando o flag de disable nao esta presente", () => {
    document.body.innerHTML = `
      <div data-list-root>
        <button type="button" data-filter-toggle aria-expanded="false">Abrir</button>
        <div data-filter-panel></div>
        <button type="button" data-filter-close>Fechar</button>
        <div data-filter-backdrop hidden></div>
        <form data-filter-form>
          <input data-filter-search value="" />
        </form>
        <p><span data-results-count>0</span></p>
        <section data-filter-section>
          <p data-section-empty hidden>Vazio</p>
          <article data-card data-searchable="Recife Frontend" data-state="PE"></article>
        </section>
      </div>
    `;

    Reflect.deleteProperty(window, "__BAIAOTECH_DISABLE_AUTOBOOT__");
    delete require.cache[require.resolve("../../src/assets/js/list-filters.js")];
    require("../../src/assets/js/list-filters.js");

    document.querySelector("[data-filter-toggle]").click();
    expect(document.querySelector("[data-list-root]").classList.contains("filters-open")).toBe(true);
  });

  it("retorna vazio quando nao existe document para inicializar", () => {
    const { bootListFilters } = loadModule();
    const previousDocument = globalThis.document;

    Reflect.deleteProperty(globalThis, "document");
    try {
      expect(bootListFilters()).toEqual([]);
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
