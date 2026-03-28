function getPrefersReducedMotion(windowRef) {
  if (!windowRef?.matchMedia) {
    return { matches: false };
  }

  return windowRef.matchMedia("(prefers-reduced-motion: reduce)");
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

function setupReveals({ documentRef, windowRef, prefersReducedMotion, Observer }) {
  if (prefersReducedMotion.matches) {
    documentRef?.querySelectorAll("[data-reveal]").forEach((node) => {
      node.classList.add("is-visible");
    });
    return () => {};
  }

  const ObserverCtor = Observer || windowRef?.IntersectionObserver;

  if (!ObserverCtor || !documentRef) {
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

  const prefersReducedMotion = refs.prefersReducedMotion || getPrefersReducedMotion(windowRef);

  return [
    setupHeaderState({ documentRef, windowRef }),
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
    bootSite,
    getPrefersReducedMotion,
    setupHeaderState,
    setupHeroProgress,
    setupReveals
  };
}

if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  !window.__BAIAOTECH_DISABLE_AUTOBOOT__
) {
  bootSite();
}
