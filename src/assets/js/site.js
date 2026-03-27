const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setupHeaderState() {
  const header = document.querySelector("[data-site-header]");

  if (!header) {
    return;
  }

  const syncHeader = () => {
    document.body.classList.toggle("is-scrolled", window.scrollY > 16);
  };

  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });
}

function setupHeroProgress() {
  if (prefersReducedMotion.matches) {
    return;
  }

  const hero = document.querySelector("[data-hero]");

  if (!hero) {
    return;
  }

  const syncHero = () => {
    const progress = Math.min(window.scrollY / 280, 1);
    hero.style.setProperty("--hero-progress", progress.toFixed(3));
  };

  syncHero();
  window.addEventListener("scroll", syncHero, { passive: true });
}

function setupReveals() {
  if (prefersReducedMotion.matches) {
    document.querySelectorAll("[data-reveal]").forEach((node) => {
      node.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
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

  document.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));
}

setupHeaderState();
setupHeroProgress();
setupReveals();
