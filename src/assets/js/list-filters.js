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

  if (open) {
    root.__lastFilterFocus = doc?.activeElement;
  }

  root.classList.toggle("filters-open", open);
  backdrop.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  doc?.body.classList.toggle("has-filter-panel", open);

  if (open) {
    if (!panel.hasAttribute("tabindex")) {
      panel.setAttribute("tabindex", "-1");
    }
    (searchInput || panel).focus();
  } else if (refs.returnFocus !== false) {
    const focusTarget =
      root.__lastFilterFocus && root.contains(root.__lastFilterFocus)
        ? root.__lastFilterFocus
        : toggle;
    focusTarget?.focus();
  }
}

function getFilterLabel(input) {
  return input.closest("label")?.querySelector("span")?.textContent?.trim() || "Filtro";
}

function getActiveFilters(root) {
  const searchInput = root.querySelector("[data-filter-search]");
  const selectInputs = [...root.querySelectorAll("[data-filter-key]")];
  const filters = [];

  if (searchInput?.value?.trim()) {
    filters.push({
      label: "Busca",
      value: searchInput.value.trim()
    });
  }

  selectInputs.forEach((input) => {
    if (!input.value) {
      return;
    }

    filters.push({
      label: getFilterLabel(input),
      value: input.selectedOptions?.[0]?.textContent?.trim() || input.value
    });
  });

  return filters;
}

function updateFilterStatus(root) {
  const status = root.querySelector("[data-filter-status]");
  const chips = root.querySelector("[data-filter-chips]");

  if (!status || !chips) {
    return;
  }

  const activeFilters = getActiveFilters(root);
  status.hidden = activeFilters.length === 0;
  chips.replaceChildren(
    ...activeFilters.map((filter) => {
      const chip = (root.ownerDocument || document).createElement("span");
      chip.className = "filter-chip";
      chip.textContent = `${filter.label}: ${filter.value}`;
      return chip;
    })
  );
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

  updateFilterStatus(root);
}

function bindListRoot(root, refs = {}) {
  const form = root.querySelector("[data-filter-form]");
  const toggle = root.querySelector("[data-filter-toggle]");
  const close = root.querySelector("[data-filter-close]");
  const backdrop = root.querySelector("[data-filter-backdrop]");
  const resets = [...root.querySelectorAll("[data-filter-reset]")];
  const searchInput = root.querySelector("[data-filter-search]");
  const selectInputs = [...root.querySelectorAll("[data-filter-key]")];
  const doc = getDocument(root, refs);
  const win = getWindow(refs);
  const debounceMs = refs.debounceMs ?? 120;
  let applyTimer;
  const openPanel = () => setFilterPanelState(root, true, { document: doc, window: win });
  const closePanel = () => setFilterPanelState(root, false, { document: doc, window: win });
  const runFilters = () => {
    if (applyTimer) {
      win?.clearTimeout?.(applyTimer);
      applyTimer = undefined;
    }
    applyFilters(root);
  };
  const scheduleFilters = () => {
    if (applyTimer) {
      win?.clearTimeout?.(applyTimer);
    }

    if (!debounceMs) {
      runFilters();
      return;
    }

    applyTimer = win?.setTimeout ? win.setTimeout(runFilters, debounceMs) : undefined;

    if (!applyTimer) {
      runFilters();
    }
  };
  const resetFilters = () => {
    form?.reset();
    runFilters();
  };
  const submitFilters = (event) => {
    event.preventDefault();
    runFilters();

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
  resets.forEach((reset) => reset.addEventListener("click", resetFilters));
  searchInput?.addEventListener("input", scheduleFilters);
  selectInputs.forEach((input) => input.addEventListener("change", scheduleFilters));
  form?.addEventListener("submit", submitFilters);
  doc?.addEventListener("keydown", closeOnEscape);
  win?.addEventListener("resize", syncDesktopState);

  applyFilters(root);

  return () => {
    toggle?.removeEventListener("click", openPanel);
    close?.removeEventListener("click", closePanel);
    backdrop?.removeEventListener("click", closePanel);
    resets.forEach((reset) => reset.removeEventListener("click", resetFilters));
    searchInput?.removeEventListener("input", scheduleFilters);
    selectInputs.forEach((input) => input.removeEventListener("change", scheduleFilters));
    form?.removeEventListener("submit", submitFilters);
    doc?.removeEventListener("keydown", closeOnEscape);
    win?.removeEventListener("resize", syncDesktopState);
    if (applyTimer) {
      win?.clearTimeout?.(applyTimer);
    }
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
    getActiveFilters,
    setFilterPanelState,
    splitDataset,
    tokenize,
    updateFilterStatus
  };
}

if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  !window.__BAIAOTECH_DISABLE_AUTOBOOT__
) {
  bootListFilters();
}
