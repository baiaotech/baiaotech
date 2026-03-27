const { expect, test } = require("@playwright/test");
const {
  expectResultsCountMatches,
  expectVisibleCardTitlesToContain,
  expectVisibleCardsToMatchDataset,
  getFirstVisibleCardTitle,
  pickFirstNonEmptyOption
} = require("./helpers/listing");

test("home renderiza navegacao principal e CTAs", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Encontre eventos e comunidades tech/i
    })
  ).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Eventos" }).click();
  await expect(page).toHaveURL(/\/eventos\/$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Encontre o próximo evento/i
    })
  ).toBeVisible();

  await page.goto("/");
  await page.locator(".hero-home__actions").getByRole("link", { name: "Ver comunidades" }).click();
  await expect(page).toHaveURL(/\/comunidades\/$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Encontre comunidades tech por estado, cidade ou tema\./i
    })
  ).toBeVisible();
});

test("eventos desktop filtra por busca e abre detalhes", async ({ page }) => {
  await page.goto("/eventos/");

  const root = page.locator("[data-list-root]");
  const initialVisible = await expectResultsCountMatches(root);
  expect(initialVisible).toBeGreaterThan(0);

  const firstTitle = await getFirstVisibleCardTitle(root);
  await page.locator("[data-filter-search]").fill(firstTitle);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  const filteredVisible = await expectResultsCountMatches(root);
  expect(filteredVisible).toBeGreaterThan(0);
  expect(filteredVisible).toBeLessThanOrEqual(initialVisible);
  await expectVisibleCardTitlesToContain(root, firstTitle);

  await root.locator("[data-card]:not([hidden]) .text-link", { hasText: "Detalhes" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();
});

test.describe("eventos mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("abre o painel de filtros, aplica estado e fecha o drawer", async ({ page }) => {
    await page.goto("/eventos/");

    const root = page.locator("[data-list-root]");
    const toggle = page.locator("[data-filter-toggle]");
    const stateSelect = page.locator('[data-filter-key="state"]');
    const stateOption = await pickFirstNonEmptyOption(stateSelect);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await stateSelect.selectOption(stateOption.value);
    await page.getByRole("button", { name: "Aplicar filtros" }).click();

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(root).not.toHaveClass(/filters-open/);
    await expectResultsCountMatches(root);
    await expectVisibleCardsToMatchDataset(root, "state", stateOption.value);
  });
});

test("comunidades desktop filtra por busca e abre detalhes", async ({ page }) => {
  await page.goto("/comunidades/");

  const root = page.locator("[data-list-root]");
  const initialVisible = await expectResultsCountMatches(root);
  expect(initialVisible).toBeGreaterThan(0);

  const firstTitle = await getFirstVisibleCardTitle(root);
  await page.locator("[data-filter-search]").fill(firstTitle);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  const filteredVisible = await expectResultsCountMatches(root);
  expect(filteredVisible).toBeGreaterThan(0);
  expect(filteredVisible).toBeLessThanOrEqual(initialVisible);
  await expectVisibleCardTitlesToContain(root, firstTitle);

  await root.locator("[data-card]:not([hidden]) .text-link", { hasText: "Detalhes" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();
});

test("comunidades desktop aplica filtro de estado real", async ({ page }) => {
  await page.goto("/comunidades/");

  const root = page.locator("[data-list-root]");
  const stateSelect = page.locator('[data-filter-key="state"]');
  const stateOption = await pickFirstNonEmptyOption(stateSelect);

  await stateSelect.selectOption(stateOption.value);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  await expectResultsCountMatches(root);
  await expectVisibleCardsToMatchDataset(root, "state", stateOption.value);
});

test("contribuir desktop mantem layout sem overflow horizontal", async ({ page }) => {
  await page.goto("/como-contribuir/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Como sugerir um evento ou uma comunidade\./i
    })
  ).toBeVisible();
  await expect(page.locator(".contribute-section")).toHaveCount(2);

  const metrics = await page.evaluate(() => {
    const sections = [...document.querySelectorAll(".contribute-section")].map((section) => {
      const rect = section.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width
      };
    });

    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sections
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  for (const section of metrics.sections) {
    expect(section.left).toBeGreaterThanOrEqual(0);
    expect(section.right).toBeLessThanOrEqual(metrics.clientWidth + 1);
  }
});

test.describe("contribuir mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("empilha o conteudo sem estouro horizontal", async ({ page }) => {
    await page.goto("/como-contribuir/");

    await expect(page.locator(".contribute-section")).toHaveCount(2);

    const metrics = await page.evaluate(() => {
      const sections = [...document.querySelectorAll(".contribute-section")].map((section) => {
        const rect = section.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right
        };
      });

      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sections
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    for (const section of metrics.sections) {
      expect(section.left).toBeGreaterThanOrEqual(0);
      expect(section.right).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
  });
});
