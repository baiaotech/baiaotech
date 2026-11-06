// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadModule() {
  window.__BAIAOTECH_DISABLE_AUTOBOOT__ = true;
  delete require.cache[require.resolve("../../src/assets/js/site.js")];
  return require("../../src/assets/js/site.js");
}

describe("site script", () => {
  const cleanups = [];

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = `
      <header data-site-header></header>
      <button data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Abrir menu"><span data-nav-label>Abrir menu</span></button>
      <nav id="site-nav" data-site-nav><a href="/">Inicio</a></nav>
      <div data-nav-backdrop hidden></div>
      <section data-hero></section>
      <div data-reveal></div>
    `;
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
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
    expect(document.documentElement.classList.contains("js")).toBe(true);
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

  it("controla o menu mobile", () => {
    window.innerWidth = 390;
    const { setupMobileNav } = loadModule();
    const cleanup = setupMobileNav({ documentRef: document, windowRef: window });
    const toggle = document.querySelector("[data-nav-toggle]");
    const nav = document.querySelector("[data-site-nav]");
    const backdrop = document.querySelector("[data-nav-backdrop]");

    expect(nav.hasAttribute("inert")).toBe(true);
    expect(nav.getAttribute("aria-hidden")).toBe("true");
    toggle.click();

    expect(document.body.classList.contains("nav-open")).toBe(true);
    expect(document.body.classList.contains("has-nav-panel")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Fechar menu");
    expect(nav.hasAttribute("inert")).toBe(false);
    expect(backdrop.hidden).toBe(false);
    expect(document.activeElement).toBe(nav.querySelector("a"));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.classList.contains("nav-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Abrir menu");
    expect(document.activeElement).toBe(toggle);
    expect(nav.hasAttribute("inert")).toBe(true);

    window.innerWidth = 1280;
    window.dispatchEvent(new Event("resize"));
    expect(nav.hasAttribute("inert")).toBe(false);
    expect(nav.hasAttribute("aria-hidden")).toBe(false);

    cleanup();
  });

  it("auto inicia quando o opt-out nao esta ativo", () => {
    window.__BAIAOTECH_DISABLE_AUTOBOOT__ = false;
    delete require.cache[require.resolve("../../src/assets/js/site.js")];
    require("../../src/assets/js/site.js");

    expect(document.body.classList.contains("is-scrolled")).toBe(false);
  });

  it("mantem o foco dentro do menu aberto nas duas direcoes", () => {
    window.innerWidth = 390;
    document.querySelector("[data-site-nav]").innerHTML = `
      <a href="/">Inicio</a>
      <a href="/eventos/">Eventos</a>
      <a href="/oculto/" hidden>Oculto</a>
      <button disabled>Indisponivel</button>
      <a href="/inacessivel/" aria-hidden="true">Inacessivel</a>
    `;
    const { setupMobileNav, getFocusable } = loadModule();
    cleanups.push(setupMobileNav({ documentRef: document, windowRef: window }));
    const toggle = document.querySelector("[data-nav-toggle]");
    const links = getFocusable(document.querySelector("[data-site-nav]"));

    expect(links).toHaveLength(2);
    toggle.click();
    links[1].focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    links[1].dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toggle);

    const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    toggle.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(links[1]);

    links[0].focus();
    const middle = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    links[0].dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });

  it("fecha pelo backdrop, mas so navega ao clicar em um link", () => {
    window.innerWidth = 390;
    const nav = document.querySelector("[data-site-nav]");
    nav.innerHTML = '<button>Outra acao</button><a href="#destino"><span>Eventos</span></a>';
    const { setupMobileNav } = loadModule();
    cleanups.push(setupMobileNav({ documentRef: document, windowRef: window }));
    const toggle = document.querySelector("[data-nav-toggle]");

    toggle.click();
    nav.querySelector("button").click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    document.querySelector("[data-nav-backdrop]").click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);

    toggle.click();
    nav.querySelector("a").focus();
    nav.querySelector("span").click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(nav.querySelector("a"));
  });

  it("fecha ao mudar para desktop sem roubar foco e permite reabrir no mobile", () => {
    window.innerWidth = 390;
    const { setupMobileNav } = loadModule();
    cleanups.push(setupMobileNav({ documentRef: document, windowRef: window }));
    const toggle = document.querySelector("[data-nav-toggle]");
    const nav = document.querySelector("[data-site-nav]");
    toggle.click();

    window.innerWidth = 1280;
    window.dispatchEvent(new Event("resize"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(nav.querySelector("a"));
    expect(nav.hasAttribute("inert")).toBe(false);

    window.innerWidth = 390;
    window.dispatchEvent(new Event("resize"));
    expect(nav.hasAttribute("inert")).toBe(true);
    toggle.click();
    expect(nav.hasAttribute("inert")).toBe(false);
    expect(toggle.querySelector("[data-nav-label]").textContent).toBe("Fechar menu");
  });

  it("remove todos os listeners do menu ao encerrar", () => {
    window.innerWidth = 390;
    const { setupMobileNav } = loadModule();
    const cleanup = setupMobileNav({ documentRef: document, windowRef: window });
    const toggle = document.querySelector("[data-nav-toggle]");
    toggle.click();
    cleanup();

    toggle.click();
    document.querySelector("[data-nav-backdrop]").click();
    document.querySelector("[data-site-nav] a").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.innerWidth = 1280;
    window.dispatchEvent(new Event("resize"));
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("suporta menu sem rotulo ou links e ignora marcacao incompleta", () => {
    window.innerWidth = 390;
    const { setupMobileNav, getFocusable, isNavDrawer, trapFocus } = loadModule();
    document.querySelector("[data-nav-label]").remove();
    document.querySelector("[data-site-nav]").replaceChildren();
    cleanups.push(setupMobileNav({ documentRef: document }));
    const toggle = document.querySelector("[data-nav-toggle]");
    toggle.click();
    expect(toggle.getAttribute("aria-label")).toBe("Fechar menu");

    const event = { key: "Tab", preventDefault: vi.fn() };
    trapFocus(event, []);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(getFocusable(null)).toEqual([]);
    expect(isNavDrawer()).toBe(false);
    expect(isNavDrawer({ innerWidth: 720 })).toBe(true);
    expect(isNavDrawer({ innerWidth: 721 })).toBe(false);

    document.querySelector("[data-nav-backdrop]").remove();
    expect(setupMobileNav({ documentRef: document })()).toBeUndefined();
  });

  it("nao revela itens fora da viewport e libera o observer ao encerrar", () => {
    const { setupReveals } = loadModule();
    let callback;
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    const cleanup = setupReveals({
      documentRef: document,
      windowRef: window,
      prefersReducedMotion: { matches: false },
      Observer: class {
        constructor(cb) { callback = cb; }
        observe() {}
        unobserve = unobserve;
        disconnect = disconnect;
      }
    });
    const target = document.querySelector("[data-reveal]");

    callback([{ isIntersecting: false, target }]);
    expect(target.classList.contains("is-visible")).toBe(false);
    expect(unobserve).not.toHaveBeenCalled();
    callback([{ isIntersecting: true, target }]);
    expect(target.classList.contains("is-visible")).toBe(true);
    expect(unobserve).toHaveBeenCalledWith(target);
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
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

    document.body.innerHTML = `<header></header><div data-reveal></div>`;
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
    expect(document.querySelector("[data-reveal]").classList.contains("is-visible")).toBe(true);
  });
});
