const { expect } = require("@playwright/test");

async function countVisibleCards(root) {
  return await root.locator("[data-card]").evaluateAll((cards) => {
    return cards.filter((card) => !card.hidden).length;
  });
}

async function getVisibleCardTexts(root, selector) {
  return await root.locator(`[data-card]:not([hidden]) ${selector}`).evaluateAll((nodes) => {
    return nodes
      .map((node) => node.textContent.trim())
      .filter(Boolean);
  });
}

async function getFirstVisibleCardTitle(root) {
  const titles = await getVisibleCardTexts(root, ".listing-row__title a");
  expect(titles.length).toBeGreaterThan(0);
  return titles[0];
}

async function expectResultsCountMatches(root) {
  const visibleCardCount = await countVisibleCards(root);
  await expect(root.locator("[data-results-count]")).toHaveText(String(visibleCardCount));
  return visibleCardCount;
}

async function expectVisibleCardTitlesToContain(root, query) {
  const titles = await getVisibleCardTexts(root, ".listing-row__title a");
  expect(titles.length).toBeGreaterThan(0);

  for (const title of titles) {
    expect(title.toLowerCase()).toContain(query.toLowerCase());
  }
}

async function pickFirstNonEmptyOption(select) {
  const option = await select.locator("option").evaluateAll((options) => {
    const match = options.find((entry) => entry.value);
    return match
      ? {
          label: match.textContent.trim(),
          value: match.value
        }
      : null;
  });

  expect(option).not.toBeNull();
  return option;
}

async function expectVisibleCardsToMatchDataset(root, datasetKey, expectedValue) {
  const values = await root.locator("[data-card]:not([hidden])").evaluateAll((cards, key) => {
    return cards.map((card) => card.dataset[key] || "");
  }, datasetKey);

  expect(values.length).toBeGreaterThan(0);

  for (const value of values) {
    expect(value).toBe(expectedValue);
  }
}

module.exports = {
  countVisibleCards,
  expectResultsCountMatches,
  expectVisibleCardTitlesToContain,
  expectVisibleCardsToMatchDataset,
  getFirstVisibleCardTitle,
  pickFirstNonEmptyOption
};
