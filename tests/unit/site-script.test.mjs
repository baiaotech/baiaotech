// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadModule() {
  window.__BAIAOTECH_DISABLE_AUTOBOOT__ = true;
  delete require.cache[require.resolve("../../src/assets/js/site.js")];
  return require("../../src/assets/js/site.js");
}

describe("site script", () => {
  beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = `
      <header data-site-header></header>
      <section data-hero></section>
      <div data-reveal></div>
    `;
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
    window.matchMedia = () => ({ matches: false });
  });

  it("sincroniza header e progresso do hero com scroll", () => {
    const { bootSite } = loadModule();
    const cleanups = bootSite({
      document,
      window,
      IntersectionObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    });

    window.scrollY = 48;
    window.dispatchEvent(new Event("scroll"));

    expect(document.body.classList.contains("is-scrolled")).toBe(true);
    expect(document.querySelector("[data-hero]").style.getPropertyValue("--hero-progress")).toBe("0.171");

    cleanups.forEach((cleanup) => cleanup());
  });

  it("revela elementos com intersection observer", () => {
    const observed = [];
    let callback;
    const { bootSite } = loadModule();
    const cleanups = bootSite({
      document,
      window,
      IntersectionObserver: class {
        constructor(cb) {
          callback = cb;
        }
        observe(node) {
          observed.push(node);
        }
        unobserve() {}
        disconnect() {}
      }
    });

    expect(observed).toHaveLength(1);
    callback([{ isIntersecting: true, target: observed[0] }]);
    expect(observed[0].classList.contains("is-visible")).toBe(true);

    cleanups.forEach((cleanup) => cleanup());
  });

  it("respeita prefers-reduced-motion", () => {
    const { bootSite, getPrefersReducedMotion } = loadModule();
    const reducedMotion = { matches: true };
    window.matchMedia = () => reducedMotion;

    bootSite({ document, window, prefersReducedMotion: reducedMotion });

    expect(getPrefersReducedMotion(window)).toBe(reducedMotion);
    expect(document.querySelector("[data-reveal]").classList.contains("is-visible")).toBe(true);
  });

  it("auto inicia quando o opt-out nao esta ativo", () => {
    window.__BAIAOTECH_DISABLE_AUTOBOOT__ = false;
    delete require.cache[require.resolve("../../src/assets/js/site.js")];
    require("../../src/assets/js/site.js");

    expect(document.body.classList.contains("is-scrolled")).toBe(false);
  });

  it("faz fallback quando matchMedia nao existe e quando nao ha observer", () => {
    const { bootSite, getPrefersReducedMotion, setupHeaderState, setupHeroProgress, setupReveals } = loadModule();

    window.matchMedia = undefined;

    expect(getPrefersReducedMotion(window)).toEqual({ matches: false });
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;

    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
    try {
      expect(bootSite()).toEqual([]);
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }

    expect(setupHeaderState({ documentRef: document, windowRef: window })()).toBeUndefined();

    document.body.innerHTML = `<header></header>`;
    expect(
      setupHeroProgress({
        documentRef: document,
        windowRef: window,
        prefersReducedMotion: { matches: false }
      })()
    ).toBeUndefined();
    expect(
      setupReveals({
        documentRef: document,
        windowRef: window,
        prefersReducedMotion: { matches: false },
        Observer: null
      })()
    ).toBeUndefined();
  });
});
