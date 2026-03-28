function tokenize(value) {
  return (value || "").toLowerCase().trim();
}

function splitDataset(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDocument(root, refs = {}) {
  return refs.document || root?.ownerDocument || (typeof document !== "undefined" ? document : null);
}

function getWindow(refs = {}) {
  return refs.window || (typeof window !== "undefined" ? window : null);
}

function setFilterPanelState(root, open, refs = {}) {
  const panel = root.querySelector("[data-filter-panel]");
  const backdrop = root.querySelector("[data-filter-backdrop]");
  const toggle = root.querySelector("[data-filter-toggle]");
  const searchInput = root.querySelector("[data-filter-search]");
  const doc = getDocument(root, refs);

  if (!panel || !backdrop || !toggle) {
    return;
  }

  root.classList.toggle("filters-open", open);
  backdrop.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  doc?.body.classList.toggle("has-filter-panel", open);

  if (open) {
    searchInput?.focus();
  } else {
    toggle.focus();
  }
}

function applyFilters(root) {
  const searchInput = root.querySelector("[data-filter-search]");
  const selectInputs = [...root.querySelectorAll("[data-filter-key]")];
  const cards = [...root.querySelectorAll("[data-card]")];
  const countNode = root.querySelector("[data-results-count]");
  const sectionNodes = [...root.querySelectorAll("[data-filter-section]")];

  const searchTerm = tokenize(searchInput?.value);
  let visibleCards = 0;

  cards.forEach((card) => {
    const text = tokenize(card.dataset.searchable);
    const matchesSearch = !searchTerm || text.includes(searchTerm);
    const matchesSelects = selectInputs.every((input) => {
      const filterValue = input.value;

      if (!filterValue) {
        return true;
      }

      const datasetValue = card.dataset[input.dataset.filterKey] || "";

      if (datasetValue.includes(",")) {
        return splitDataset(datasetValue).includes(filterValue);
      }

      return datasetValue === filterValue;
    });

    const visible = matchesSearch && matchesSelects;
    card.hidden = !visible;
    card.setAttribute("aria-hidden", String(!visible));

    if (visible) {
      visibleCards += 1;
    }
  });

  if (countNode) {
    countNode.textContent = String(visibleCards);
  }

  sectionNodes.forEach((section) => {
    const sectionCards = [...section.querySelectorAll("[data-card]")];
    const hasVisibleCards = sectionCards.some((card) => !card.hidden);
    const emptyNode = section.querySelector("[data-section-empty]");

    if (emptyNode) {
      emptyNode.hidden = hasVisibleCards;
    }
  });
}

function bindListRoot(root, refs = {}) {
  const form = root.querySelector("[data-filter-form]");
  const toggle = root.querySelector("[data-filter-toggle]");
  const close = root.querySelector("[data-filter-close]");
  const backdrop = root.querySelector("[data-filter-backdrop]");
  const reset = root.querySelector("[data-filter-reset]");
  const doc = getDocument(root, refs);
  const win = getWindow(refs);
  const openPanel = () => setFilterPanelState(root, true, { document: doc, window: win });
  const closePanel = () => setFilterPanelState(root, false, { document: doc, window: win });
  const resetFilters = () => {
    form?.reset();
    applyFilters(root);
  };
  const submitFilters = (event) => {
    event.preventDefault();
    applyFilters(root);

    if (win?.innerWidth <= 900) {
      setFilterPanelState(root, false, { document: doc, window: win });
    }
  };
  const closeOnEscape = (event) => {
    if (event.key === "Escape" && root.classList.contains("filters-open")) {
      setFilterPanelState(root, false, { document: doc, window: win });
    }
  };
  const syncDesktopState = () => {
    if (win?.innerWidth > 900) {
      setFilterPanelState(root, false, { document: doc, window: win });
    }
  };

  toggle?.addEventListener("click", openPanel);
  close?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);
  reset?.addEventListener("click", resetFilters);
  form?.addEventListener("submit", submitFilters);
  doc?.addEventListener("keydown", closeOnEscape);
  win?.addEventListener("resize", syncDesktopState);

  applyFilters(root);

  return () => {
    toggle?.removeEventListener("click", openPanel);
    close?.removeEventListener("click", closePanel);
    backdrop?.removeEventListener("click", closePanel);
    reset?.removeEventListener("click", resetFilters);
    form?.removeEventListener("submit", submitFilters);
    doc?.removeEventListener("keydown", closeOnEscape);
    win?.removeEventListener("resize", syncDesktopState);
  };
}

function bootListFilters(refs = {}) {
  const doc = refs.document || (typeof document !== "undefined" ? document : null);

  if (!doc) {
    return [];
  }

  return [...doc.querySelectorAll("[data-list-root]")].map((root) =>
    bindListRoot(root, { ...refs, document: doc })
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    applyFilters,
    bindListRoot,
    bootListFilters,
    setFilterPanelState,
    splitDataset,
    tokenize
  };
}

if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  !window.__BAIAOTECH_DISABLE_AUTOBOOT__
) {
  bootListFilters();
}
