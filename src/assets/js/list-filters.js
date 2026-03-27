function tokenize(value) {
  return (value || "").toLowerCase().trim();
}

function splitDataset(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setFilterPanelState(root, open) {
  const panel = root.querySelector("[data-filter-panel]");
  const backdrop = root.querySelector("[data-filter-backdrop]");
  const toggle = root.querySelector("[data-filter-toggle]");
  const searchInput = root.querySelector("[data-filter-search]");

  if (!panel || !backdrop || !toggle) {
    return;
  }

  root.classList.toggle("filters-open", open);
  backdrop.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("has-filter-panel", open);

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

document.querySelectorAll("[data-list-root]").forEach((root) => {
  const form = root.querySelector("[data-filter-form]");
  const toggle = root.querySelector("[data-filter-toggle]");
  const close = root.querySelector("[data-filter-close]");
  const backdrop = root.querySelector("[data-filter-backdrop]");
  const reset = root.querySelector("[data-filter-reset]");

  toggle?.addEventListener("click", () => setFilterPanelState(root, true));
  close?.addEventListener("click", () => setFilterPanelState(root, false));
  backdrop?.addEventListener("click", () => setFilterPanelState(root, false));
  reset?.addEventListener("click", () => {
    form?.reset();
    applyFilters(root);
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    applyFilters(root);

    if (window.innerWidth <= 900) {
      setFilterPanelState(root, false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("filters-open")) {
      setFilterPanelState(root, false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setFilterPanelState(root, false);
    }
  });

  applyFilters(root);
});
