const NAV_DRAWER_MAX_WIDTH = 720;
const NAV_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getPrefersReducedMotion(windowRef) {
  if (!windowRef?.matchMedia) {
    return { matches: false };
  }

  return windowRef.matchMedia("(prefers-reduced-motion: reduce)");
}

function getFocusable(container) {
  if (!container) {
    return [];
  }

  return [...container.querySelectorAll(NAV_FOCUSABLE_SELECTOR)].filter(
    (node) => !node.hidden && node.getAttribute("aria-hidden") !== "true"
  );
}

function trapFocus(event, nodes) {
  if (event.key !== "Tab" || nodes.length === 0) {
    return;
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (event.shiftKey && event.target === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault();
    first.focus();
  }
}

function isNavDrawer(windowRef) {
  return (windowRef?.innerWidth ?? Number.POSITIVE_INFINITY) <= NAV_DRAWER_MAX_WIDTH;
}

function setupHeaderState({ documentRef, windowRef }) {
  const header = documentRef?.querySelector("[data-site-header]");

  if (!header) {
    return () => {};
  }

  const syncHeader = () => {
    documentRef.body.classList.toggle("is-scrolled", windowRef.scrollY > 16);
  };

  syncHeader();
  windowRef.addEventListener("scroll", syncHeader, { passive: true });

  return () => {
    windowRef.removeEventListener("scroll", syncHeader);
  };
}

function setupHeroProgress({ documentRef, windowRef, prefersReducedMotion }) {
  if (prefersReducedMotion.matches) {
    return () => {};
  }

  const hero = documentRef?.querySelector("[data-hero]");

  if (!hero) {
    return () => {};
  }

  const syncHero = () => {
    const progress = Math.min(windowRef.scrollY / 280, 1);
    hero.style.setProperty("--hero-progress", progress.toFixed(3));
  };

  syncHero();
  windowRef.addEventListener("scroll", syncHero, { passive: true });

  return () => {
    windowRef.removeEventListener("scroll", syncHero);
  };
}

function setupMobileNav({ documentRef, windowRef = documentRef?.defaultView }) {
  const toggle = documentRef?.querySelector("[data-nav-toggle]");
  const label = toggle?.querySelector("[data-nav-label]");
  const nav = documentRef?.querySelector("[data-site-nav]");
  const backdrop = documentRef?.querySelector("[data-nav-backdrop]");

  if (!toggle || !nav || !backdrop) {
    return () => {};
  }

  const updateLabel = (open) => {
    const text = open ? "Fechar menu" : "Abrir menu";
    toggle.setAttribute("aria-label", text);
    if (label) {
      label.textContent = text;
    }
  };

  const syncAccessibility = (open) => {
    if (isNavDrawer(windowRef)) {
      nav.toggleAttribute("inert", !open);
      if (open) {
        nav.removeAttribute("aria-hidden");
      } else {
        nav.setAttribute("aria-hidden", "true");
      }
      return;
    }

    nav.removeAttribute("inert");
    nav.removeAttribute("aria-hidden");
  };

  const setOpen = (open, { returnFocus = true } = {}) => {
    documentRef.body.classList.toggle("nav-open", open);
    documentRef.body.classList.toggle("has-nav-panel", open);
    toggle.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    updateLabel(open);
    syncAccessibility(open);

    if (open) {
      getFocusable(nav)[0]?.focus();
    } else if (returnFocus) {
      toggle.focus();
    }
  };

  const toggleNav = () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  };
  const closeNav = () => setOpen(false);
  const handleKeydown = (event) => {
    if (toggle.getAttribute("aria-expanded") !== "true") {
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    trapFocus(event, [toggle, ...getFocusable(nav)]);
  };
  const closeFromLink = (event) => {
    if (event.target.closest("a")) {
      setOpen(false, { returnFocus: false });
    }
  };
  const syncViewport = () => {
    if (!isNavDrawer(windowRef)) {
      setOpen(false, { returnFocus: false });
      return;
    }

    syncAccessibility(toggle.getAttribute("aria-expanded") === "true");
  };

  toggle.addEventListener("click", toggleNav);
  backdrop.addEventListener("click", closeNav);
  documentRef.addEventListener("keydown", handleKeydown);
  nav.addEventListener("click", closeFromLink);
  windowRef?.addEventListener("resize", syncViewport);
  syncViewport();

  return () => {
    toggle.removeEventListener("click", toggleNav);
    backdrop.removeEventListener("click", closeNav);
    documentRef.removeEventListener("keydown", handleKeydown);
    nav.removeEventListener("click", closeFromLink);
    windowRef?.removeEventListener("resize", syncViewport);
  };
}

function setupReveals({ documentRef, windowRef, prefersReducedMotion, Observer }) {
  const revealAll = () => {
    documentRef?.querySelectorAll("[data-reveal]").forEach((node) => {
      node.classList.add("is-visible");
    });
  };

  if (prefersReducedMotion.matches) {
    revealAll();
    return () => {};
  }

  const ObserverCtor = Observer || windowRef?.IntersectionObserver;

  if (!ObserverCtor || !documentRef) {
    revealAll();
    return () => {};
  }

  const observer = new ObserverCtor(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.12
    }
  );

  documentRef.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));

  return () => {
    observer.disconnect();
  };
}

function bootSite(refs = {}) {
  const documentRef = refs.document || (typeof document !== "undefined" ? document : null);
  const windowRef = refs.window || (typeof window !== "undefined" ? window : null);

  if (!documentRef || !windowRef) {
    return [];
  }

  documentRef.documentElement.classList.add("js");

  const prefersReducedMotion = refs.prefersReducedMotion || getPrefersReducedMotion(windowRef);

  return [
    setupHeaderState({ documentRef, windowRef }),
    setupMobileNav({ documentRef, windowRef }),
    setupHeroProgress({ documentRef, windowRef, prefersReducedMotion }),
    setupReveals({
      documentRef,
      windowRef,
      prefersReducedMotion,
      Observer: refs.IntersectionObserver
    })
  ];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    NAV_DRAWER_MAX_WIDTH,
    bootSite,
    getFocusable,
    getPrefersReducedMotion,
    isNavDrawer,
    setupHeaderState,
    setupHeroProgress,
    setupMobileNav,
    setupReveals,
    trapFocus
  };
}

if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  !window.__BAIAOTECH_DISABLE_AUTOBOOT__
) {
  bootSite();
}
